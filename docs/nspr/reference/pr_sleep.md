# PR_Sleep

Causes the current thread to yield for a specified amount of time.

## Syntax

```{code}
#include <prthread.h>

PRStatus PR_Sleep(PRIntervalTime ticks);
```

### Parameter

{doc}`pr_sleep` has the following parameter:

`ticks`

: The number of ticks you want the thread to sleep for (see
  {doc}`printervaltime`).

### Returns

Calling {doc}`pr_sleep` with a parameter equivalent to
`PR_INTERVAL_NO_TIMEOUT` is an error and results in a `PR_FAILURE`
error.

## Description

{doc}`pr_sleep` simply waits on a condition for the amount of time
specified. If you set ticks to `PR_INTERVAL_NO_WAIT`, the thread
yields.

If ticks is not `PR_INTERVAL_NO_WAIT`, {doc}`pr_sleep` uses an existing
lock, but has to create a new condition for this purpose. If you have
already created such structures, it is more efficient to use them
directly.

Calling {doc}`pr_sleep` with the value of ticks set to
`PR_INTERVAL_NO_WAIT` simply surrenders the processor to ready threads
of the same priority. All other values of ticks cause {doc}`pr_sleep` to
block the calling thread for the specified interval.

Threads blocked in {doc}`pr_sleep` are interruptible.
