"""Support for schedules in Home Assistant."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date, datetime, time, timedelta
import itertools
from typing import Any

import voluptuous as vol

from homeassistant.const import (
    ATTR_EDITABLE,
    CONF_DEVICE_CLASS,
    CONF_ICON,
    CONF_ID,
    CONF_NAME,
    CONF_STATE,
    CONF_UNIT_OF_MEASUREMENT,
    EVENT_HOMEASSISTANT_STARTED,
    SERVICE_RELOAD,
    STATE_OFF,
    STATE_ON,
    STATE_UNKNOWN,
)
from homeassistant.core import (
    Context,
    CoreState,
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.components.sensor import (
    NON_NUMERIC_DEVICE_CLASSES,
    DEVICE_CLASSES_SCHEMA,
)
from homeassistant.exceptions import (
    TemplateError,
    ServiceNotFound,
)
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.collection import (
    CollectionEntity,
    DictStorageCollection,
    DictStorageCollectionWebsocket,
    IDManager,
    SerializedStorageCollection,
    YamlCollection,
    sync_entity_lifecycle,
)
from homeassistant.helpers.entity_component import EntityComponent
from homeassistant.helpers.event import (
    async_track_point_in_time,
    async_track_point_in_utc_time,
)
from homeassistant.helpers.script import Script, async_validate_actions_config
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType, StateType, VolDictType
from homeassistant.util import dt as dt_util

from .const import (
    ATTR_DURATION,
    ATTR_LOOKAHEAD,
    ATTR_LOOKBEHIND,
    ATTR_NEXT_EVENT,
    ATTR_NORMAL,
    ATTR_TRANSITIONS,
    ATTR_VARIATION,
    CONF_ALL_DAYS,
    CONF_AT,
    CONF_ATTRIBUTES,
    CONF_ATTR_TRANSITIONS,
    CONF_BINARY,
    CONF_DATA,
    CONF_DELAY_STARTUP,
    CONF_FROM,
    CONF_HH,
    CONF_MM,
    CONF_SELECT_SCRIPT,
    CONF_SS,
    CONF_SUB_SCHEDULES,
    CONF_TO,
    CONF_TRANSITIONS,
    DOMAIN,
    LOGGER,
    SERVICE_ADVANCE,
    SERVICE_ALTER,
    SERVICE_BOOST,
    SERVICE_DUMP,
    SERVICE_GET,
    SERVICE_REFRESH,
    SERVICE_VARY,
    WEEKDAY_TO_CONF,
)

#from .services import (
#    register_actions,
#)

STORAGE_VERSION = 1
STORAGE_VERSION_MINOR = 1


def valid_schedule(schedule: list[dict[str, str]]) -> list[dict[str, str]]:
    """Validate the schedule of time ranges.

    Ensure they have no overlap and the end time is greater than the start time.
    """
 #   LOGGER.warning( f"almacp valid_schedule {schedule}" )
    # Empty schedule is valid
    if not schedule:
        return schedule

    # Sort the schedule by start times
    schedule = sorted(schedule, key=lambda time_range: time_range[CONF_FROM])

    # Check if the start time of the next event is before the end time of the previous event
    previous_to = None
    for time_range in schedule:
        if time_range[CONF_FROM] >= time_range[CONF_TO]:
            raise vol.Invalid(
                f"Invalid time range, from {time_range[CONF_FROM]} is after"
                f" {time_range[CONF_TO]}"
            )

        # Check if the from time of the event is after the to time of the previous event
        if previous_to is not None and previous_to > time_range[CONF_FROM]:
            raise vol.Invalid("Overlapping times found in schedule")

        previous_to = time_range[CONF_TO]

    return schedule


def deserialize_to_time(value: Any) -> Any:
    """Convert 24:00 and 24:00:00 to time.max."""
    if not isinstance(value, str):
        return cv.time(value)

    parts = value.split(":")
    if len(parts) < 2:
        return cv.time(value)
    hour = int(parts[0])
    minute = int(parts[1])

    if hour == 24 and minute == 0:
        return time.max

    return cv.time(value)


def serialize_to_time(value: Any) -> Any:
    """Convert time.max to 24:00:00."""
    if value == time.max:
        return "24:00:00"
    return vol.Coerce(str)(value)


# Extra data that the user can set on each time range
CUSTOM_DATA_SCHEMA = vol.Schema({str: vol.Any(bool, str, int, float)})
CUSTOM_ATTR_SCHEMA_LIST = vol.Schema({str: vol.All( cv.ensure_list, [vol.Any(bool, str, int, float)] )})

BASE_SCHEMA: VolDictType = {
    vol.Required(CONF_NAME): vol.All(str, vol.Length(min=1)),
    vol.Optional(CONF_ICON): cv.icon,
}

TIME_RANGE_SCHEMA: VolDictType = {
    vol.Required(CONF_FROM): cv.time,
    vol.Required(CONF_TO): deserialize_to_time,
    vol.Optional(CONF_DATA): CUSTOM_DATA_SCHEMA,
}

# Serialize time in validated config
STORAGE_TIME_RANGE_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_FROM): vol.Coerce(str),
        vol.Required(CONF_TO): serialize_to_time,
        vol.Optional(CONF_DATA): CUSTOM_DATA_SCHEMA,
    }
)

SCHEDULE_SCHEMA: VolDictType = {
    vol.Optional(day, default=[]): vol.All(
        cv.ensure_list, [TIME_RANGE_SCHEMA], valid_schedule
    )
    for day in CONF_ALL_DAYS
}

AT_SCHEMA: VolDictType = {
    vol.Required( CONF_HH ) :vol.All(vol.Coerce(int), vol.Range(min=0, max=23)),
    vol.Optional( CONF_MM, default=0 ) : vol.All(vol.Coerce(int), vol.Range(min=0, max=59)),
    vol.Optional( CONF_SS, default=0 ) : vol.All(vol.Coerce(int), vol.Range(min=0, max=59)),
}

TRANSITION_SCHEMA: vol.Schema({
    vol.Required( CONF_AT ) : vol.Schema({
        vol.Required( CONF_HH ) :vol.All(vol.Coerce(int), vol.Range(min=0, max=23)),
        vol.Optional( CONF_MM, default=0 ) : vol.All(vol.Coerce(int), vol.Range(min=0, max=59)),
        vol.Optional( CONF_SS, default=0 ) : vol.All(vol.Coerce(int), vol.Range(min=0, max=59)),
    }),
    vol.Optional( CONF_STATE, default=0 ) : vol.Any( int, float, bool, str),
})

SUBSCHED_SCHEMA: VolDictType = {
  #  vol.Required( CONF_TRANSITIONS ) : vol.All( cv.ensure_list, [TRANSITION_SCHEMA] ),
    vol.Required( CONF_TRANSITIONS ) : vol.All( cv.ensure_list, [
        vol.Schema({
            vol.Required( CONF_AT ) : vol.Schema({
                vol.Required( CONF_HH ) :vol.All(vol.Coerce(int), vol.Range(min=0, max=23)),
                vol.Optional( CONF_MM, default=0 ) : vol.All(vol.Coerce(int), vol.Range(min=0, max=59)),
                vol.Optional( CONF_SS, default=0 ) : vol.All(vol.Coerce(int), vol.Range(min=0, max=59)),
            }),
            vol.Optional( CONF_STATE, default=STATE_UNKNOWN ) : vol.Any( int, float, bool, str),
        }),
    ]),
}

SUBSCHEDS_SCHEMA: VolDictType = {
    vol.Required( str ) : SUBSCHED_SCHEMA,
}

SCHEDULE_SCHEMA_V2: VolDictType = {
    vol.Required( CONF_SELECT_SCRIPT, default=" -missing-" ) : vol.Coerce(str),
    vol.Optional( CONF_DELAY_STARTUP ) : vol.All(int, vol.Range(min=0, max=60)),
    vol.Required( CONF_BINARY, default=False ) : bool,
    vol.Required( CONF_SUB_SCHEDULES ) : SUBSCHEDS_SCHEMA,
    vol.Optional( CONF_DEVICE_CLASS): DEVICE_CLASSES_SCHEMA,
    vol.Optional( CONF_UNIT_OF_MEASUREMENT): cv.string,
    vol.Required( CONF_ATTRIBUTES, default={}): CUSTOM_ATTR_SCHEMA_LIST,
    vol.Required( CONF_ATTR_TRANSITIONS, default=10) : vol.All( int, vol.Range(min=0, max=20)),
}

STORAGE_SCHEDULE_SCHEMA: VolDictType = {
    vol.Optional(day, default=[]): vol.All(
        cv.ensure_list, [TIME_RANGE_SCHEMA], valid_schedule, [STORAGE_TIME_RANGE_SCHEMA]
    )
    for day in CONF_ALL_DAYS
}

# Validate YAML config
CONFIG_SCHEMA = vol.Schema(
   {DOMAIN: cv.schema_with_slug_keys(
       vol.Any(
           vol.All(BASE_SCHEMA | SCHEDULE_SCHEMA_V2),
           vol.All(BASE_SCHEMA | SCHEDULE_SCHEMA),
           )
       )},
    extra=vol.ALLOW_EXTRA,
)

# Validate storage config
STORAGE_SCHEMA = vol.Schema(
    {vol.Required(CONF_ID): cv.string} | BASE_SCHEMA | STORAGE_SCHEDULE_SCHEMA
)
# Validate + transform entity config
ENTITY_SCHEMA = vol.Schema(
    {vol.Required(CONF_ID): cv.string} | BASE_SCHEMA | SCHEDULE_SCHEMA
)
ENTITY_SCHEMA_V2 = vol.Schema(
    {vol.Required(CONF_ID): cv.string} | BASE_SCHEMA | SCHEDULE_SCHEMA_V2
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up a schedule."""
  #  LOGGER.warning( f"almacp async_setup now={dt_util.now()} as_utc={dt_util.as_utc(dt_util.now())} tz={dt_util.get_default_time_zone()}" )
    LOGGER.warning( f"almacp async_setup now={dt_util.now()} as_utc={dt_util.as_utc(dt_util.now())} tz={dt_util.now().tzinfo}" )
    hass.loop.set_debug(True) # almacp
 #   for one in pprint.pformat(config).splitlines() : LOGGER.warning(one)

    component = EntityComponent[Schedule](LOGGER, DOMAIN, hass)

    id_manager = IDManager()

    yaml_collection = YamlCollection(LOGGER, id_manager)
    sync_entity_lifecycle(hass, DOMAIN, DOMAIN, component, yaml_collection, Schedule)

    storage_collection = ScheduleStorageCollection(
        Store(
            hass,
            key=DOMAIN,
            version=STORAGE_VERSION,
            minor_version=STORAGE_VERSION_MINOR,
        ),
        id_manager,
    )
    sync_entity_lifecycle(hass, DOMAIN, DOMAIN, component, storage_collection, Schedule)

    await yaml_collection.async_load(
        [{CONF_ID: id_, **cfg} for id_, cfg in config.get(DOMAIN, {}).items()]
    )
    await storage_collection.async_load()

    DictStorageCollectionWebsocket(
        storage_collection,
        DOMAIN,
        DOMAIN,
        BASE_SCHEMA | STORAGE_SCHEDULE_SCHEMA,
        BASE_SCHEMA | STORAGE_SCHEDULE_SCHEMA,
    ).async_setup(hass)

    async def reload_service_handler(service_call: ServiceCall) -> None:
        """Reload yaml entities."""
        LOGGER.warning( f"almacp reload_service_handler {service_call}" )
        conf = await component.async_prepare_reload(skip_reset=True)
        await yaml_collection.async_load(
            [{CONF_ID: id_, **cfg} for id_, cfg in conf.get(DOMAIN, {}).items()]
        )

    async_register_admin_service(
        hass,
        DOMAIN,
        SERVICE_RELOAD,
        reload_service_handler,
    )

    component.async_register_entity_service(
        SERVICE_ADVANCE,
        {},
        handle_advance,
        supports_response=SupportsResponse.ONLY,
    )

    component.async_register_entity_service(
        SERVICE_ALTER,
        {
            vol.Required(CONF_STATE): vol.Coerce(str),
        },
        handle_alter,
        supports_response=SupportsResponse.ONLY,
    )

    component.async_register_entity_service(
        SERVICE_BOOST,
        {
            vol.Required(ATTR_DURATION): vol.All( cv.time_period, vol.Clamp( max=timedelta( hours=12 ) ) ),
            vol.Required(CONF_STATE): vol.Coerce(str),
        },
        handle_boost,
        supports_response=SupportsResponse.ONLY,
    )

    component.async_register_entity_service(
        SERVICE_DUMP,
        {},
        handle_dump,
        supports_response=SupportsResponse.ONLY,
    )

    component.async_register_entity_service(
        SERVICE_GET,
        {},
        async_get_schedule_service,
        supports_response=SupportsResponse.ONLY,
    )

    component.async_register_entity_service(
        SERVICE_REFRESH,
        {},
        handle_refresh,
    )

    component.async_register_entity_service(
        SERVICE_VARY,
        {
            vol.Required(ATTR_NORMAL): cv.datetime,
            vol.Required(ATTR_VARIATION): cv.datetime,
            vol.Required(ATTR_LOOKAHEAD, default=timedelta(hours=1)): vol.All( cv.time_period, vol.Clamp( max=timedelta(hours=4) ) ),
            vol.Required(ATTR_LOOKBEHIND, default=timedelta(hours=1)): vol.All( cv.time_period, vol.Clamp( max=timedelta(hours=4) ) ),
        },
        handle_vary,
        supports_response=SupportsResponse.ONLY,
    )

    await component.async_setup(config)

    return True


class ScheduleStorageCollection(DictStorageCollection):
    """Schedules stored in storage."""

    SCHEMA = vol.Schema(BASE_SCHEMA | STORAGE_SCHEDULE_SCHEMA)

    async def _process_create_data(self, data: dict) -> dict:
        """Validate the config is valid."""
        self.SCHEMA(data)
        return data

    @callback
    def _get_suggested_id(self, info: dict) -> str:
        """Suggest an ID based on the config."""
        name: str = info[CONF_NAME]
        return name

    async def _update_data(self, item: dict, update_data: dict) -> dict:
        """Return a new updated data object."""
        self.SCHEMA(update_data)
        return {CONF_ID: item[CONF_ID]} | update_data

    async def _async_load_data(self) -> SerializedStorageCollection | None:
        """Load the data."""
        if data := await super()._async_load_data():
            data["items"] = [STORAGE_SCHEMA(item) for item in data["items"]]
        return data

class Transition:
    """A transition of a sub-schedule."""

    _dt: datetime

    def __init__( self, tdate:date, ttime:time, state: StateType = STATE_UNKNOWN ) -> None:
        """Initialise a Transition."""
        tz = dt_util.now().tzinfo
        if isinstance( ttime, dict ):
            self._dt = datetime( tdate.year, tdate.month, tdate.day,
                            ttime.get(CONF_HH,12), ttime.get(CONF_MM,0), ttime.get(CONF_SS,0), 0,
                         #   dt_util.get_default_time_zone()
                            tzinfo=tz
                            )
        else:
            self._dt = datetime( tdate.year, tdate.month, tdate.day,
                            ttime.hour, ttime.minute, ttime.second, ttime.microsecond,
                        #    dt_util.get_default_time_zone()
                            tzinfo=tz
                            )

        self._date: date = tdate
        self._state: StateType = state
        self._variation: timedelta | None = None
        self.inhibited = 0

    @property
    def attrib(self) -> dict:
        """Return data to include in Schedule attribute."""
        return {CONF_AT: self._dt, CONF_STATE: self._state}

    @property
    def date(self) -> date:
        """Return the date of this transition."""
        return self._date

    @property
    def datetime(self) -> datetime:
        """Return the datetime of this transition."""
        return self._dt

    @datetime.setter
    def datetime(self, dt: datetime) -> None:
        """Set the time of this transition."""
        self._dt = dt

    @property
    def inhibited(self) -> int:
        """Return the inhibition reason. Zero means uninhibited."""
        return self._inhibited

    @inhibited.setter
    def inhibited(self, reason: int) -> None:
        self._inhibited = reason

    @property
    def state(self) -> StateType:
        """Return the state for this transition."""
        return self._state

    @state.setter
    def state(self, state: StateType) -> None:
        """Set the state for this transition."""
        self._state = state

    def vary(self, vary: timedelta, start: datetime, finish: datetime) -> None:
        """Vary."""

        if (start < self.datetime < finish) and self._variation is not None:
            # this transition is within range, but is already varied.
            # So UNvary this transition.
            pre = self.datetime
            self.datetime -= self._variation
            self._variation = None
            LOGGER.warning( f"UNvaried from {pre} to {self.datetime}" )

        if (start < self.datetime < finish) and self._variation is None:
            # this transition is within range, and is not already varied.
            # So vary this transition.
            pre = self.datetime
            self.datetime += vary
            self._variation = vary
            LOGGER.warning( f"varied from {pre} to {self.datetime}" )

    def __repr__(self):
        """Generate string representation."""
        return (f"{self.date.day:02}-{self.datetime.hour:02}:{self.datetime.minute:02}:{self.datetime.second:02}"
               f" {self.state}"
               f"{'' if not self.inhibited else ' inh:' + str(self.inhibited)}")

class Schedule(CollectionEntity):
    """Schedule entity."""

    _entity_component_unrecorded_attributes = frozenset(
        {ATTR_EDITABLE, ATTR_NEXT_EVENT}
    )

    _attr_has_entity_name = True
    _attr_should_poll = False
 #   _attr_state: Literal["on", "off"]
    _attr_state: StateType
    _config: ConfigType
    _next: datetime
    _unsub_update: Callable[[], None] | None = None
    _V2: bool = False
    _is_binary: bool
    _transitions: [Transition] = []
    _state_is_numeric: bool = False
    _is_ready: bool = False

    def __init__(self, config: ConfigType, editable: bool) -> None:
        """Initialize a schedule."""
        self._V2 = CONF_SUB_SCHEDULES in config
        self._is_binary = config.get(CONF_BINARY, False) or not self._V2
 #       if self._V2 : LOGGER.warning( f"almacp Schedule.__init__ config={config}" )
        self._config = ENTITY_SCHEMA_V2(config) if self._V2 else ENTITY_SCHEMA(config)
  #      LOGGER.warning( f"almacp Schedule.__init__ _config={self._config}" )
        self._attr_capability_attributes = {ATTR_EDITABLE: editable}
        self._attr_icon = self._config.get(CONF_ICON)
        self._attr_name = self._config[CONF_NAME]
        self._attr_unique_id = self._config[CONF_ID]
        self._attr_state = STATE_UNKNOWN

        self._unrecorded_attributes = self.all_custom_data_keys()
        if self._V2:
            LOGGER.warning( f"almacp Schedule.__init__ _config={self._config}" )
            self._attr_extra_state_attributes = self._config.get(CONF_ATTRIBUTES)
            self._attr_unit_of_measurement = self._config.get(CONF_UNIT_OF_MEASUREMENT)
            self._unrecorded_attributes |= frozenset( ATTR_TRANSITIONS )
            if CONF_DEVICE_CLASS in self._config:
                self._attr_device_class = self._config[CONF_DEVICE_CLASS]
                self._state_is_numeric = self._attr_device_class not in NON_NUMERIC_DEVICE_CLASSES
            else:
                self._state_is_numeric = False

        # Exclude any custom attributes that may be present on time ranges from recording.
        self._Entity__combined_unrecorded_attributes = (
            self._entity_component_unrecorded_attributes | self._unrecorded_attributes
        )

        if self._V2:
            self._transitions : [Transition] = []

        LOGGER.warning( f"almacp Schedule.__init__ for {self.name} exiting" )

    @classmethod
    def from_storage(cls, config: ConfigType) -> Schedule:
        """Return entity instance initialized from storage."""
   #     LOGGER.warning( f"almacp Schedule from_storage {config}" )
        return cls(config, editable=True)

    @classmethod
    def from_yaml(cls, config: ConfigType) -> Schedule:
        """Return entity instance initialized from yaml."""
   #     LOGGER.warning( f"almacp Schedule from_yaml {config}" )
        schedule = cls(config, editable=False)
        schedule.entity_id = f"{DOMAIN}.{config[CONF_ID]}"
        return schedule

    async def async_update_config(self, config: ConfigType) -> None:
        """Handle when the config is updated."""
        self._V2 = CONF_SUB_SCHEDULES in config
        self._is_binary = (not self._V2) or config.get(CONF_BINARY, False)
        LOGGER.warning( f"almacp Schedule async_update_config {config}" )
        self._config = ENTITY_SCHEMA_V2(config) if self._V2 else ENTITY_SCHEMA(config)
        self._attr_icon = config.get(CONF_ICON)
        self._attr_name = config[CONF_NAME]

        if self._V2:
            # fill with transitions up until end of tomorrow...
            self._transitions : [Transition] = []
            await self._async_replenish_transitions()

        self._clean_update()

    @callback
    def _clean_up_listener(self) -> None:
        """Remove the update timer."""
        if self._unsub_update is not None:
            self._unsub_update()
            self._unsub_update = None

    async def _async_get_subschedule_for(self, when: date) -> list | None:

  #      LOGGER.warning( f"async_get_subschedules_for( {when} )" )

        async def temp():
            def dummy() -> list[Transition]:
                LOGGER.warning( f"subschedule for {when.isoformat()} is missing" )
                return [ Transition( tdate=when, ttime=time( hour=12, tzinfo = dt_util.get_default_time_zone() ) ) ]

            # If there is exactly one subschedule specified, then use it.
            sub_schedules = self._config[ CONF_SUB_SCHEDULES ]
            if len( sub_schedules ) == 1:
                subsched = list(sub_schedules.values())[0]
            else:
                sname = self._config[CONF_SELECT_SCRIPT]
                result_variable = "value"
                actions = [
                    {"action": f"{'' if '.' in sname else 'script.'}{sname}",
                      "response_variable": "result",
                      "data": {       # The input data supplied to the selection script
                          "date"      : when,
                          "entity"    : DOMAIN + '.' + self.unique_id,
                          "choices"   : set( sub_schedules ),
                          "result_variable" : result_variable,
                          },
                     }
                ]

                try:
                    await async_validate_actions_config( self.hass, actions )
                except ValueError as e:
                    return dummy()

                script = Script(
                    self.hass,
                    actions,
                    'get_subschedule_id',
                    DOMAIN,
                )

                LOGGER.warning( f'{self.name} about to run script, sequence= {script.sequence}' )
                try:
                    result = await script.async_run( context=Context() )
                except (TemplateError, ServiceNotFound) as e:
                    return dummy()

                LOGGER.warning( f"{self.name} output from script {sname} vars={vars(result)}" )

                if (subsched_id := result.variables.get('result',{}).get( result_variable )) is None:
                    LOGGER.error( "script %s did not return a sub-schedule id", sname )
                    return dummy()

                if (subsched := self._config[ CONF_SUB_SCHEDULES ].get( subsched_id )) is None:
                    LOGGER.error( f"sub-schedule %s was requested by script %s for %s, but was not found",
                        subsched_id, sname, when.isoformat()  )
                    return dummy()

            return sorted(
                [
                    Transition( tdate=when, ttime=trans[ CONF_AT ], state=trans.get(CONF_STATE))
                    for trans in subsched.get( CONF_TRANSITIONS, [] )
                ],
                key = lambda t : t.datetime
                ) or dummy()

        res = await temp()
  #      LOGGER.warning( f"{self.name} _async_get_subscheduule_for( {when} ) gave {len(res)} transitions" ) 
        return res  

    async def _async_replenish_transitions(self, until: date | None = None, update: bool = False) -> None:
        """Replenish the list of Transitions, filling it until the specified date ."""

        if not self._V2:
            return

        LOGGER.warning( f'_async_replenish_transitions, for {self.name} until {until} update={update}' )

        now = dt_util.now()
        if not until:
            until = now.date() + timedelta( days=1 )

        if not self._transitions:
            # Initialise an empty schedule, with yesterday's sub-schedule
  #          LOGGER.warning( 'Initialising %s with schedule for yesterday',self.name )
            self._transitions = await self._async_get_subschedule_for( now.date() - timedelta( days=1 ) )

        # Find the date after the most recent date currently in schedule
        dt = self._transitions[-1].date + timedelta( days=1 )

    #    LOGGER.warning( f"until={until} ({until.__class__.__name__})" )
    #    LOGGER.warning( f"dt={dt} ({dt.__class__.__name__})" )
        # Add entries for dates not yet in the schedule, but not after "until".
        while self._transitions[-1].date < until:
            LOGGER.warning( f'adding sched for {dt} for {self.name}' )
            self._transitions += await self._async_get_subschedule_for( dt )
            dt += timedelta( days=1 )
    #    LOGGER.warning( f"all days added, update={update}")

        keep = 1  # number of past transitions to retain

        # Remove historic entries from the start : only need to leave "keep" transition prior to "now"
        past = 0  # count of past transitions
        for transition in self._transitions:
            if transition.datetime < now:
                past += 1
            else:
                break

        if past > keep:
 #           LOGGER.warning( f"removing transitions[0:{past-keep}] for {self.name}" )
            del self._transitions[0:past-keep]
 #       else:
 #           LOGGER.warning( f"no transitions removed. update={update}" )

        if update:
            self._attr_extra_state_attributes[ ATTR_TRANSITIONS ] = [
                    t.attrib for t in self._transitions ][:self._config.get( CONF_ATTR_TRANSITIONS )]
            LOGGER.warning( f"About to write_ha_state (of {self._attr_state}), for {self.name}, after replenishing" )
            self.async_write_ha_state()

    async def _async_delayed_replenish_transitions(self,  _: datetime | None = None) -> None:
        """Replenish the list of Transitions, and update the state."""

        LOGGER.warning( f"_async_delayed_replenish_transitions for {self.name}" )
       # await self._async_replenish_transitions( update=True)
        await self._async_replenish_transitions()
        self._is_ready = True

        self._update()

  #      self._attr_extra_state_attributes[ ATTR_TRANSITIONS ] = [t.attrib for t in self._transitions ][:10]
  #      self.async_write_ha_state()


    async def async_added_to_hass(self) -> None:
        """Run when entity about to be added to hass."""
        LOGGER.warning( "Almacp Schedule async_added_to_hass %s",  self.name )
        self.async_on_remove(self._clean_up_listener)

        if self._V2:
            LOGGER.warning( f"A hass state={self.hass.state}")

            if CONF_DELAY_STARTUP in self._config and self.hass.state != CoreState.running:
                LOGGER.warning( f"listening for hass starting" )
                self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, self.async_hass_started)
                return

            # fill with transitions up until end of tomorrow...
            await self._async_replenish_transitions()

        self._is_ready = True
        self._update()

    async def async_hass_started(self, event: Event) -> None:
        LOGGER.warning( f"{self.name} hass has started" )

        if (startup_delay := self._config.get( CONF_DELAY_STARTUP )):

            LOGGER.warning( f"delaying startup for {startup_delay} seconds" )

            async_track_point_in_utc_time(
                self.hass,
                self._async_delayed_replenish_transitions,
                dt_util.now() + timedelta( seconds=startup_delay),
            )
        else:
            await self._async_delayed_replenish_transitions()

    def get_schedule(self) -> ConfigType:
        """Return the schedule."""
        LOGGER.warning( "Almacp Schedule get_schedule" )
        if not self._V2:
            return {d: self._config[d] for d in WEEKDAY_TO_CONF.values()}
        return None

    def dump_schedule(self, msg: str | None = None) -> None:
        """Log schedule Transitions."""
        if msg:
            LOGGER.warning( "Dump_schedule %s", msg )
        for dt in self._transitions:
            LOGGER.warning( dt )

    def advance(self) -> dict:
        """Advance the current value, to the next transition value."""
        self.dump_schedule( msg="pre-advance" )
        now = dt_util.now()
        response = {}

        now_transition = None
        next_transition = None
        for transition in self._transitions:
            if transition.datetime >= now:
                next_transition = transition
                break
            now_transition = transition

        if now_transition and next_transition:
            now_transition.state = next_transition.state
            self._clean_update()
            tm = next_transition.time
            response["msg"] = f"schedule advanced to {tm.hour:02}:{tm.minute:02}:{tm.second:02}"

        self.dump_schedule( msg="post-advance" )
        return response

    def alter(self, value : StateType) -> dict:
        """Alter the current value of the schedule, to the specified value.

        This altered value will only remain in force until the next schedule transition.
        """
        self.dump_schedule( msg="pre-alter" )
        now = dt_util.now()
        response = {}

        now_transition = None
        next_transition = None
        for transition in self._transitions:
            if transition.datetime >= now:
                next_transition = transition
                break
            now_transition = transition

        if now_transition and next_transition and (value is not None):
            now_transition.state = value
            self._clean_update()
            tm = next_transition.datetime
            response["msg"] = f"schedule altered to {value} until {tm.hour:02}:{tm.minute:02}:{tm.second:02}"

        self.dump_schedule( msg="post-alter" )

        return response

    async def boost(self, boost_value : StateType, duration : timedelta) -> dict:
        """Alter the value of the schedule to the specified value, for the specified time.

        This deletes any future transitions which the specified time overlaps.
        """
        self.dump_schedule( msg="pre-boost" )
        now = dt_util.now()
        until = now + duration
        response = {}

        now_index = None
        until_index = None
        for inx, transition in enumerate( self._transitions ):
            if transition.datetime < now:
                now_index = inx
                now_transition = transition
            if transition.datetime >= until:
                break
            until_index = inx
            until_transition = transition

        LOGGER.warning( f"until={until.day:02}-{until.hour:02}:{until.minute:02}:{until.minute:02} boost_value={boost_value}" )
        LOGGER.warning( f"duration={duration} now_index={now_index} until_index={until_index}" )
        LOGGER.warning( f"latest transition is currently {self._transitions[-1].datetime}" )

        # Ensure that the existing  transitions extend beyond the desired boost time...
        while until > self._transitions[-1].datetime:
            await self._async_replenish_transitions()

        if (now_index is None) or (until_index is None) or (until_index < now_index):
            LOGGER.error( f"schedule {self.name} invalid boost until {until} to {boost_value}" )
            response["msg"] = f"schedule {self.name} invalid boost until {until} to {boost_value}"

        elif until_index == now_index:
            # Insert one additional transition
            current = now_transition.state
            self._transitions.insert( now_index+1, Transition( tdate=until.date(), ttime=until.time(), state=current ) )
            now_transition.state = boost_value

        else:
            until_transition.datetime = until
            now_transition.state = boost_value

            # If any transitions have been overlapped, just delete them:
            if until_index > now_index +1:
                del self._transitions[ now_index+1 : until_index ]

        if not response:
            response["msg"] = f"schedule boosted to {boost_value} until {until.hour:02}:{until.minute:02}:{until.second:02}"

        self._clean_update()
        self.dump_schedule( msg="post-boost" )
        return response

    async def refresh(self) -> None:
        """Remove all existing Transitions; generate a new set."""
        if not self._is_ready:
            LOGGER.warning( f"{self.name} is not ready for refresh yet" )
            return
        self._transitions : [Transition] = []
        await self._async_replenish_transitions()
        self._clean_update()

    def vary( self, normal: datetime, variation: datetime, lookahead: timedelta, lookbehind: timedelta ) -> dict :
        """Vary the schedule.

        This means moving a part of the schedule.

        "normal" and "variations" define the normal time, and the variation time.
        For example, if you usually have an alarm at 08:00, but on a particular day you want it at 07:00,
        then set normal to 08:00 and variation to 07:00.

        lookahead and lookbehind specify the timescale range (with respect to "normal") of the
        Transitions which will be moved.
        """

        if not self._is_ready:
            LOGGER.warning( f"{self.name} is not ready for vary yet" )
            return

        vary_by = variation - normal
        vary_by_seconds = vary_by.total_seconds()
        range_start = normal - lookbehind
        range_finish = normal + lookahead
        LOGGER.warning( f"normal={normal} variation={variation}" )
        LOGGER.warning( f"lookahead={lookahead} lookbehind={lookbehind}" )
        LOGGER.warning( f"vary_by={vary_by} ({vary_by_seconds} secs) range={range_start} to {range_finish}" )
        if not vary_by_seconds:
            return
        self.dump_schedule( msg="pre-vary" )
        [trans.vary( vary_by, range_start, range_finish ) for trans in self._transitions]

        # iterate upwards, mark out-of-order transitions as inhibited...
        if vary_by_seconds < 0:
            previous_dt = self._transitions[-1].datetime + timedelta(days=1)
            for trans in reversed( self._transitions ):
                if trans.datetime < previous_dt:
                    LOGGER.warning( f'good trans.datetime={trans.datetime} previous_dt-{previous_dt}' )
                    previous_dt = trans.datetime
                else: #bad
                    LOGGER.warning( f'BAD trans.datetime={trans.datetime} previous_dt-{previous_dt}' )
                    trans.inhibited=42
        else:
            previous_dt = self._transitions[0].datetime - timedelta(days=1)
            for trans in self._transitions:
                if trans.datetime > previous_dt:
                    LOGGER.warning( f'good trans.datetime={trans.datetime} previous_dt-{previous_dt}' )
                    previous_dt = trans.datetime
                else: #bad
                    LOGGER.warning( f'BAD trans.datetime={trans.datetime} previous_dt-{previous_dt}' )
                    trans.inhibited=42

        self.dump_schedule( msg="post-vary" )
        return

    @callback
    def _clean_update(self) -> None:
        self._clean_up_listener()
        self._update()

    @callback
    def _update(self, _: datetime | None = None) -> None:
        """Update the states of the schedule."""
        now = dt_util.now()
        LOGGER.warning( f"almacp Schedule {self.name} _update _V2={self._V2} now={now} uom={self.unit_of_measurement}" )
    #    for ent in ('input_boolean.occupied',):
    #        LOGGER.warning( f"ent={ent} state={self.hass.states.get(ent).state}" )
    #        LOGGER.warning( f"ent={ent} is_state={self.hass.states.is_state(ent, 'on')}" )
    #        LOGGER.warning( f"ent={ent} dir_state={dir(self.hass.states.get(ent))}" )

        next_event = None

        if self._V2:
            
            ## TEMPORARY - check Transitions are sorted
            if self._transitions:
                orderok = -1
                for enn, t in enumerate(self._transitions):
                    if enn == 0:
                        whereami = t.datetime
                        continue
                    if t.datetime <= whereami:
                        orderok = enn
                        break
                    whereami = t.datetime
                if orderok < 0:
                    LOGGER.warning( f"transitions order is OK")
                else:
                    LOGGER.warning( f"transitions order is DUFF at {enn}")
            self.dump_schedule()

            for transition in self._transitions:
                if transition.inhibited:
                    continue
                if transition.datetime >= now:
                    next_event = transition.datetime
                    break
                want = transition

            if self._state_is_numeric:
                try:
                    required_state = int( str(want.state) )
                except ValueError:
                    try:
                        required_state = float( str(want.state) )
                    except ValueError:
                        required_state = STATE_UNKNOWN
            else:
                required_state = want.state

            self._attr_state = required_state if not self._is_binary else STATE_ON if cv.boolean( required_state ) else STATE_OFF
            LOGGER.warning( f"{self.name} _attr_state has been set to {self._attr_state} ({type(self._attr_state)})" )

            self._attr_extra_state_attributes[ ATTR_NEXT_EVENT ] = next_event,

            # Arrange to replenish transitions, and update the entity state, sometime...
            self.hass.async_create_task( self._async_replenish_transitions( update=True ) )
      #      self.hass.async_create_task( self._async_replenish_transitions_and_update() )

 #           LOGGER.warning( f'waiting until {next_event}' )
 #        #   self._unsub_update = async_track_point_in_time(
 #           self._unsub_update = async_track_point_in_utc_time(
 #               self.hass,
 #               self._update,
 #               next_event,
 #           )

        else:
            todays_schedule = self._config.get(WEEKDAY_TO_CONF[now.weekday()], [])

            # Determine current schedule state
            for time_range in todays_schedule:
                # The current time should be greater or equal to CONF_FROM.
                if now.time() < time_range[CONF_FROM]:
                    continue
                # The current time should be smaller (and not equal) to CONF_TO.
                # Note that any time in the day is treated as smaller than time.max.
                if now.time() < time_range[CONF_TO] or time_range[CONF_TO] == time.max:
                    self._attr_state = STATE_ON
                    current_data = time_range.get(CONF_DATA)
                    break
            else:
                self._attr_state = STATE_OFF
                current_data = None

            # Find next event in the schedule, loop over each day (starting with
            # the current day) until the next event has been found.
            for day in range(8):  # 8 because we need to search today's weekday next week
                day_schedule = self._config.get(
                    WEEKDAY_TO_CONF[(now.weekday() + day) % 7], []
                )
                times = sorted(
                    itertools.chain(
                        *[
                            [time_range[CONF_FROM], time_range[CONF_TO]]
                            for time_range in day_schedule
                        ]
                    )
                )

                if next_event := next(
                    (
                        possible_next_event
                        for timestamp in times
                        if (
                            possible_next_event := (
                                datetime.combine(now.date(), timestamp, tzinfo=now.tzinfo)
                                + timedelta(days=day)
                                if timestamp != time.max
                                # Special case for midnight of the following day.
                                else datetime.combine(now.date(), time(), tzinfo=now.tzinfo)
                                + timedelta(days=day + 1)
                            )
                        )
                        > now
                    ),
                    None,
                ):
                    # We have found the next event in this day, stop searching.
                    break

            self._attr_extra_state_attributes = {
                ATTR_NEXT_EVENT: next_event,
            }

            if current_data:
                # Add each key/value pair in the data to the entity's state attributes
                self._attr_extra_state_attributes.update(current_data)

            self.async_write_ha_state()

        if next_event:
            LOGGER.warning( f"{'V2' if self._V2 else 'V1'} waiting until {next_event} ")
            LOGGER.warning( f"B hass state={self.hass.state}")
            self._unsub_update = async_track_point_in_utc_time(
                self.hass,
                self._update,
                next_event,
            )

    def all_custom_data_keys(self) -> frozenset[str]:
        """Return the set of all currently used custom data attribute keys."""
        data_keys = set()

        for weekday in WEEKDAY_TO_CONF.values():
            if not (weekday_config := self._config.get(weekday)):
                continue  # this weekday is not configured

            for time_range in weekday_config:
                time_range_custom_data = time_range.get(CONF_DATA)

                if not time_range_custom_data or not isinstance(
                    time_range_custom_data, dict
                ):
                    continue  # this time range has no custom data, or it is not a dict

                data_keys.update(time_range_custom_data.keys())

        return frozenset(data_keys)

async def handle_boost(schedule: Schedule, call: ServiceCall) -> ServiceResponse:
    """Handle boost action."""
    return await schedule.boost( call.data.get( CONF_STATE ), call.data.get( ATTR_DURATION ) )

async def handle_alter(schedule: Schedule, call: ServiceCall) -> ServiceResponse:
    """Handle alter action.

    Alter the value of the schedule to the specified value.
    This altered value will only remain in force until the next schedule transition.
    """
    return schedule.alter( call.data.get( CONF_STATE ) )

async def handle_advance(schedule: Schedule, call: ServiceCall) -> ServiceResponse:
    """Handle advance action."""
    return schedule.advance()

async def handle_dump(schedule : Schedule, call: ServiceCall) -> ServiceResponse:
    """Handle dump action."""
    return schedule.dump_schedule()

async def handle_vary(schedule : Schedule, call: ServiceCall) -> ServiceResponse:
    """Handle vary action."""
    LOGGER.warning( f"handle_vary {call.data}, response {call.return_response}" )
    return schedule.vary(   dt_util.as_utc( call.data.get( ATTR_NORMAL ) ),
                            dt_util.as_utc( call.data.get( ATTR_VARIATION )),
                            call.data.get( ATTR_LOOKAHEAD ),
                            call.data.get( ATTR_LOOKBEHIND ) )

async def handle_refresh(schedule : Schedule, call: ServiceCall) -> ServiceResponse:
    """Handle refresh action."""
    return await schedule.refresh()

async def async_get_schedule_service(
    schedule: Schedule, service_call: ServiceCall
) -> ServiceResponse:
    """Return the schedule configuration."""
    rc = schedule.get_schedule()
    LOGGER.warning( f"almacp async_get_schedule_service, {schedule}, {service_call}" )
    LOGGER.warning( f"{rc}" )
    return schedule.get_schedule()
