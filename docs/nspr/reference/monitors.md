In addition to the mutex type {doc}`prlock`, NSPR provides a special type,
{doc}`prmonitor`, for use in Java programming. This chapter describes the
NSPR API for creation and manipulation of a mutex of type {doc}`prmonitor`.

- [Monitor Type](#monitor-type)
- [Monitor Functions](#monitor-functions)

With a mutex of type {doc}`prlock`, a single thread may enter the monitor
only once before it exits, and the mutex can have multiple associated
condition variables.

With a mutex of type {doc}`prmonitor`, a single thread may re-enter a
monitor as many times as it sees fit. The first time the thread enters a
monitor, it acquires the monitor's lock and the thread's entry count is
incremented to 1. Each subsequent time the thread successfully enters
the same monitor, the thread's entry count is incremented again, and
each time the thread exits the monitor, the thread's entry count is
decremented. When the entry count for a thread reaches zero, the thread
releases the monitor's lock, and other threads that were blocked while
trying to enter the monitor will be rescheduled.

A call to {doc}`pr_wait` temporarily returns the entry count to zero. When
the calling thread resumes, it has the same entry count it had before
the wait operation.

Unlike a mutex of type {doc}`prlock`, a mutex of type {doc}`prmonitor` has a
single, implicitly associated condition variable that may be used to
facilitate synchronization of threads with the change in state of
monitored data.

For an introduction to NSPR thread synchronization, including locks and
condition variables, see [Introduction to
NSPR](introduction_to_nspr.md).

(monitor-type)=

# Monitor Type

With the exception of {doc}`pr_newmonitor`, which creates a new monitor
object, all monitor functions require a pointer to an opaque object of
type {doc}`prmonitor`.

(monitor-functions)=

# Monitor Functions

All monitor functions are thread-safe. However, this safety does not
extend to protecting the monitor object from deletion.

> - {doc}`pr_newmonitor` creates a new monitor.
> - {doc}`pr_destroymonitor` destroys a monitor object.
> - {doc}`pr_entermonitor` enters the lock associated with a specified
>   monitor.
> - {doc}`pr_exitmonitor` decrements the entry count associated with a
>   specified monitor.
> - {doc}`pr_wait` waits for a notify on a specified monitor's condition
>   variable.
> - {doc}`pr_notify` notifies a thread waiting on a specified monitor's
>   condition variable.
> - {doc}`pr_notifyall` notifies all threads waiting on a specified
>   monitor's condition variable.
