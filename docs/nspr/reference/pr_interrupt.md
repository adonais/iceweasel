# PR_Interrupt

Sets the interrupt request for a target thread.

## Syntax

```{code}
#include <prthread.h>

PRStatus PR_Interrupt(PRThread *thread);
```

### Parameter

{doc}`pr_interrupt` has the following parameter:

`thread`

: The thread whose interrupt request you want to set.

### Returns

The function returns one of the following values:

- If the specified thread is currently blocked, `PR_SUCCESS`.
- Otherwise, `PR_FAILURE`.

## Description

The purpose of {doc}`pr_interrupt` is to request that a thread performing
some task stop what it is doing and return to some control point. It is
assumed that a control point has been mutually arranged between the
thread doing the interrupting and the thread being interrupted. When the
interrupted thread reaches the prearranged point, it can communicate
with its peer to discover the real reason behind the change in plans.

The interrupt request remains in the thread's state until it is
delivered exactly once or explicitly canceled. The interrupted thread
returns `PR_FAILURE` (-1) with an error code (see {doc}`pr_geterror`) for
blocking operations that return a {doc}`prstatus` (such as I/O operations,
monitor waits, or waiting on a condition). To check whether the thread
was interrupted, compare the result of {doc}`pr_geterror` with
`PR_PENDING_INTERRUPT_ERROR`.

{doc}`pr_interrupt` may itself fail if the target thread is invalid.

## Bugs

{doc}`pr_interrupt` has the following limitations and known bugs:

- There can be a delay for a thread to be interrupted from a blocking
  I/O function. In all NSPR implementations, the maximum delay is at
  most five seconds. In the pthreads-based implementation on Unix, the
  maximum delay is 0.1 seconds.
- File I/O is considered instantaneous, so file I/O functions cannot be
  interrupted. Unfortunately the standard input, output, and error
  streams are treated as files by NSPR, so a {doc}`pr_read` call on
  `PR_STDIN` cannot be interrupted even though it may block
  indefinitely.
- In the NT implementation, {doc}`pr_connect` cannot be interrupted.
- In the NT implementation, a file descriptor is not usable and must be
  closed after an I/O function on the file descriptor is interrupted.
