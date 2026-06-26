"""Constants for the schedule integration."""

import logging
from typing import Final

DOMAIN: Final = "schedule"
LOGGER = logging.getLogger(__package__)

CONF_DATA: Final = "data"
CONF_FRIDAY: Final = "friday"
CONF_FROM: Final = "from"
CONF_MONDAY: Final = "monday"
CONF_SATURDAY: Final = "saturday"
CONF_SUNDAY: Final = "sunday"
CONF_THURSDAY: Final = "thursday"
CONF_TO: Final = "to"
CONF_TUESDAY: Final = "tuesday"
CONF_WEDNESDAY: Final = "wednesday"
CONF_ALL_DAYS: Final = {
    CONF_MONDAY,
    CONF_TUESDAY,
    CONF_WEDNESDAY,
    CONF_THURSDAY,
    CONF_FRIDAY,
    CONF_SATURDAY,
    CONF_SUNDAY,
}

CONF_AT: Final = "at"
CONF_ATTRIBUTES: Final = "attributes"
CONF_ATTR_TRANSITIONS = "number_of_attribute_transitions"
CONF_BINARY: Final = "binary"
CONF_DELAY_STARTUP: Final = "delay_startup"
CONF_HH: Final = "hh"
CONF_MM: Final = "mm"
CONF_SUB_SCHEDULES: Final = "sub_schedules"
CONF_SELECT_SCRIPT: Final = "select_script"
CONF_SS: Final = "ss"
CONF_TRANSITIONS: Final = "transitions"

DTK: Final = "_dt"

ATTR_DURATION: Final = "duration"
ATTR_LOOKAHEAD: Final = "lookahead"
ATTR_LOOKBEHIND: Final = "lookbehind"
ATTR_NEXT_EVENT: Final = "next_event"
ATTR_NORMAL: Final = "normal"
ATTR_TRANSITIONS: Final = "transitions"
ATTR_VARIATION: Final = "variation"

WEEKDAY_TO_CONF: Final = {
    0: CONF_MONDAY,
    1: CONF_TUESDAY,
    2: CONF_WEDNESDAY,
    3: CONF_THURSDAY,
    4: CONF_FRIDAY,
    5: CONF_SATURDAY,
    6: CONF_SUNDAY,
}

SERVICE_ADVANCE: Final = "advance_schedule"
SERVICE_ALTER: Final = "alter_schedule"
SERVICE_BOOST: Final = "boost_schedule"
SERVICE_DUMP: Final = "dump_schedule"
SERVICE_GET: Final = "get_schedule"
SERVICE_REFRESH: Final = "refresh_schedule"
SERVICE_VARY: Final = "vary_schedule"
