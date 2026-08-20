# schedule_dynamic
Home Assistant drop-in replacement for schedule integration

## Please note that dynamic schedules can currently only be set up via YAML.

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
`select_script` | Y | mandatory for new
`sub_schedules` | Y |
`device_class` | N |
`delay_startup` | N | The delay (seconds, default 0) between Home Assistant startup and the first `select_script` invocation.
`unit_of_measurement` | N | 
`attributes` | N | 

## selector script

The name of the selector script is defined in the schedule definition.

The selector script itself is not defined with the schedule definition : this allows multiple schedule definitions to use the same script.

The script will receive the following variables as input :

* `date` is a date object which contains the date for which a schedule is desired
* `entity` contains the entity id of the schedule
* `choices` is the set of sub-schedule names defined in the schedule, one of which must be returned from the script.

The script should return the following variables :

* `subsched` contains the name of the particular sub-schedule which is to be used

The script should use the variables which are passed as input to determine whuch sub-schedule to use for any particular day.
