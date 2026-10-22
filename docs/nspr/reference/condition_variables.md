This chapter describes the API for creating and destroying condition
variables, notifying condition variables of changes in monitored data,
and making a thread wait on such notification.

- [Condition Variable Type](#condition-variable-type)
- [Condition Variable Functions](#condition-variable-functions)

Conditions are closely associated with a single monitor, which typically
consists of a mutex, one or more condition variables, and the monitored
data. The association between a condition and a monitor is established
when a condition variable is created, and the association persists for
its life. In addition, a static association exists between the condition
and some data within the monitor. This data is what will be manipulated
by the program under the protection of the monitor.

A call to {doc}`pr_waitcondvar` causes a thread to block until a specified
condition variable receives notification of a change of state in its
associated monitored data. Other threads may notify the condition
variable when changes occur.

For an introduction to NSPR thread synchronization, including locks and
condition variables, see [Introduction to
NSPR](introduction_to_nspr.md).

For reference information on NSPR locks, see
[Locks](locks.md).

NSPR provides a special type, {doc}`prmonitor`, for use with Java. Unlike a
mutex of type {doc}`prlock`, which can have multiple associated condition
variables of type {doc}`prcondvar`, a mutex of type {doc}`prmonitor` has a
single, implicitly associated condition variable. For information about
{doc}`prmonitor`, see [Monitors](monitors.md).

(condition-variable-type)=

# Condition Variable Type

> - {doc}`prcondvar`

(condition-variable-functions)=

# Condition Variable Functions

> - {doc}`pr_newcondvar`
> - {doc}`pr_destroycondvar`
> - {doc}`pr_waitcondvar`
> - {doc}`pr_notifycondvar`
> - {doc}`pr_notifyallcondvar`
