# schedule_dynamic
Home Assistant drop-in replacement for schedule integration

## dynamic schedules can currently only be set up via YAML.

## Summary

Provides a dynamic scheduling facility.

* dynamic schedule generation
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
`name` | Y |
`select_script` | Y | If missing, the schedule will not be dynamic.
`sub_schedules` | Y | Each key within `sub_schedules` specifies one sub-schedule. See #sub-schedule definition# below.
`device_class` | N |
`delay_startup` | N | The delay (seconds, default 0) between Home Assistant startup and the first `select_script` invocation.
`unit_of_measurement` | N | 
`attributes` | N | Each key within `attributes` specifies an attribute which will be assigned to the schedule entity

## Sub-schedule definition
 key | mandatory? | descriptin
 --- | --- | ---
 `transitions` | Y | A list of transitions. Each transition comprises (a) an `at` key, which specifies via three sub-keys `hh`, `mm` and `ss` the time (hour/minute/second) of a schedule state transition, and (b) a `state` key, which specifies the required state.  
`hh` and `state` are mandatory; `mm` and `ss` are optional and default to 0.

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
