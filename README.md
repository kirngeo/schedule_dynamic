# schedule_dynamic
Home Assistant drop-in replacement for schedule integration

**dynamic schedules can currently only be set up via YAML.**

## Summary

Provides a dynamic scheduling facility.

* dynamic schedule generation
* for example, vary the schedule according to the day of the week, or the season of the year.
* can use any type of state (eg numeric), not merely boolean.
* schedules not restricted to daily / weekly / etc
* each schedule basically comprises
  * a set of sub-schedules, and
  * the name of a selector script, which is automatically invoked as required in order to select one of the sub-schedules.

## sub-schedules

Each of the sub-schedules is named, and consists of a list of transitions, each of which specifies 
* the time of day
* the state desired for the schedule helper entity

Note that the sub-schedules do not contain information about day-of-week, or day-of-month, etc. They only contain the time of day and the required entity state.

## Schedule definition
 key | mandatory? | description
 --- | --- | ---
`name` | Y | descriptive name
`select_script` | Y | If missing, the schedule will not be dynamic.
`sub_schedules` | Y | Each key within `sub_schedules` specifies one sub-schedule. See **sub-schedule definition** below.
`device_class` | N |
`delay_startup` | N | The delay (seconds, default 0) between Home Assistant startup and the first `select_script` invocation.
`unit_of_measurement` | N | 
`attributes` | N | Each key within `attributes` specifies an attribute which will be assigned to the schedule entity

## Sub-schedule definition
 key | mandatory? | description
 --- | --- | ---
 `transitions` | Y | A list of transitions. See **transition definition** below.

### transition definition
 key | description
 --- | ---
 `at` | sub-keys `hh` (mandatory), `mm` (default 0) and `mm` (default 0) specify the time of a schedule state transition.
 `state` | specifies the required schedule state, at time `at`.

## selector script

The name of the selector script is defined in the schedule definition.

The selector script itself is not defined with the schedule definition : this allows multiple schedule definitions to use the same script.

The script will receive the following variables as input :

* `date` is a date object which contains the date for which a schedule is desired
* `entity` contains the entity id of the schedule
* `choices` is the set of sub-schedule names defined in the schedule, one of which must be returned from the script.

The script should return the following variables as output :

* `subsched` contains the name of the particular sub-schedule which is to be used

The script should use the variables which are passed as input to determine whuch sub-schedule to use for any particular day.

## Example scenario

This is a simple scenario, which controls two Thermostatic Radiator Valves in one room of a house.

The temperature setpoint of the valves are adjusted according to the time of day, and the season of the year, and the occupancy of the area of the house.

You could also use the day of the week, or any other properties of the date.

There is a helper called `input_boolean.occupied` which specifies whether the area is occupied or not.

### Example schedule definition

* for briefness, only the `winter` and `off` subschedules are defined here.
* the `winter` subschedule varies the TRV temperatures according to personal desires.
* the `off` sub-schedule flips the TRV temperatures between two low values daily, merely to exercise the TRVs.
* schedule entity attribute `trv` is used by the associated automation to specify the TRVs involved.
* schedule entity attribute `occupied` is used by the `select_script` to determine occupancy of the area.

```
ch_temp_lounge:
  name: Lounge central heating temp
  select_script: script.schedule_selector
  device_class: temperature
  delay_startup: 10
  unit_of_measurement: "°C"
  attributes:
    trv:
      - hive_trv_e 
      - hive_trv_d 
    occupied: input_boolean.occupied
  sub_schedules:
    winter:
      transitions:
        - at:
            hh: 1
            mm: 3
          state: 13
        - at:
            hh: 7
            mm: 16
          state: 17
        - at:
            hh: 7
            mm: 50
          state: 18
        - at:
            hh: 8
            mm: 25
          state: 19.5
        - at:
            hh: 8
            mm: 50
          state: 19
        - at:
            hh: 9
          state: 19
        - at:
            hh: 10
          state: 18.5
        - at:
            hh: 14
          state: 20
        - at:
            hh: 17
            mm: 40
          state: 19
        - at:
            hh: 18
            mm: 45
          state: 20
        - at:
            hh: 20
            mm: 5
          state: 19
        - at:
            hh: 21
          state: 20
        - at:
            hh: 22
          state: 18
        - at:
            hh: 22
            mm: 50
          state: 13
    "off":
      transitions:
        - at:
            hh: 4
          state: 7
        - at:
            hh: 16
          state: 7.5
```

### Example schedule-selector script

For briefness, all seasons are classified by this example script to be in `winter`.

This script can be used by multiple schedules - the entity_id of the schedule is passed into the script.

```
variables:
  results: |
    {% set vars = namespace(occ=true, results=[]) %}

    {# iterate occupied switch states #}
    {# if any are not 'on', this area is not occupied #}
    {% for sw in state_attr(entity_id,'occupied') or [] %}
    {%   if states(sw) != 'on' %}
    {%     set vars.occ = false %}
    {%   endif %}
    {%   set vars.results = vars.results + [(sw, states(sw))] %}
    {% endfor %}

    {# default sub-schedule is 'off' #}
    {% set subsched = 'off' %}

    {# if area is occupied, pick sub-schedule according to the month #}
    {% if vars.occ %}
      {% if date.month in [12, 1, 2,     3, 4, 5, 6, 7, 8, 9, 10, 11] %}
        {% set subsched = 'winter' %}
      {% elif date.month in [3, 4, 5] %}
        {% set subsched = 'spring' %}
      {% elif date.month in [6, 7, 8] %}
        {% set subsched = 'summer' %}
      {% else %}
        {% set subsched = 'autumn' %}
      {% endif %}
    {% endif %}

    {% set vars.results = vars.results + [('subsched', subsched)] %}

    {{ dict.from_keys( vars.results ) }}
sequence:
  - stop: normal
    response_variable: results
mode: single
alias: schedule selector
description: ''
fields:
  date:
    selector:
      date: {}
    required: true
  entity_id:
    selector:
      text: null
    required: true
  choices:
    selector:
      object: {}
    required: true
```

### Example automation on schedule value change

* note that `schedule.ch_temp_fguest` is not defined in the example schedule definition above. It is merely an exemplar to show that changes in the states of multiple schedules can trigger this same automation.

* This example uses MQTT to send appropriate messages to the TRV. Your TRVs may require a different method of communication.


```
alias: on CH schedule value change
description: ''
triggers:
  - trigger: state
    entity_id:
      - schedule.ch_temp_lounge
      - schedule.ch_temp_fguest
conditions: []
actions:
  - repeat:
      for_each: '{{ state_attr(trigger.entity_id,''trv'') or [] }}'
      sequence:
        - action: mqtt.publish
          metadata: {}
          data:
            evaluate_payload: false
            qos: '0'
            retain: false
            topic: zigbee2mqtt/{{repeat.item}}/set
            payload: '{"occupied_heating_setpoint": {{states(trigger.entity_id)}}}'
mode: parallel
max: 10
```

