This chapter describes the date and time functions in NSPR.

NSPR represents time in two ways, absolute time and clock/calendar time.
NSPR provides types and constants for both representations, and
functions to convert time values between the two.

- Absolute time representation treats time instants as points along the
  time line. A time instant is represented by its position on the time
  line relative to the origin, called the epoch. NSPR defines the epoch
  to be midnight (00:00:00) 1 January 1970 UTC (Coordinated Universal
  Time). In this form, time is just a point on the time line. There is
  no notion of time zone.
- Clock/calendar time, used for human interfaces, represents time in
  the familiar year, month, day, hour, minute, second components. In
  this form, the time zone information is important. For example,
  without specifying the time zone, the time 8:00AM 1 May 1998 is
  ambiguous. The NSPR data type for clock/calendar time, called an
  exploded time, has the time zone information in it, so that its
  corresponding point in absolute time is uniquely specified.

Note that absolute and clock times are not normally used in timing
operations. For functions that deal with the measurement of elapsed time
and with timeouts, see [Interval Timing](interval_timing.md).

- [Macros for Time Unit
  Conversion](#macros-for-time-unit-conversion)
- [Types and Constants](#types-and-constants)
- [Time Parameter Callback
  Functions](#time-parameter-callback-functions)
- [Functions](#functions)

(macros-for-time-unit-conversion)=

# Macros for Time Unit Conversion

Macros for converting between seconds, milliseconds, microseconds, and
nanoseconds.

- {doc}`pr_msec_per_sec`
- {doc}`pr_usec_per_sec`
- {doc}`pr_nsec_per_sec`
- {doc}`pr_usec_per_msec`
- {doc}`pr_nsec_per_msec`

(types-and-constants)=

# Types and Constants

Types and constants defined for NSPR dates and times are:

- {doc}`prtime`
- {doc}`prtimeparameters`
- {doc}`prexplodedtime`

(time-parameter-callback-functions)=

# Time Parameter Callback Functions

In some geographic locations, use of Daylight Saving Time (DST) and the
rule for determining the dates on which DST starts and ends have changed
a few times. Therefore, a callback function is used to determine time
zone information.

You can define your own time parameter callback functions, which must
conform to the definition {doc}`prtimeparamfn`. Two often-used callback
functions of this type are provided by NSPR:

- {doc}`prtimeparamfn`
- {doc}`pr_localtimeparameters` and {doc}`pr_gmtparameters`

# Functions

The functions that create and manipulate time and date values are:

- {doc}`pr_now`
- {doc}`pr_explodetime`
- {doc}`pr_implodetime`
- {doc}`pr_normalizetime`
