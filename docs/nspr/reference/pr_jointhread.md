# PR_JoinThread

Blocks the calling thread until a specified thread terminates.

## Syntax

```{code}
#include <prthread.h>

PRStatus PR_JoinThread(PRThread *thread);
```

### Parameter

{doc}`pr_jointhread` has the following parameter:

`thread`

: A valid identifier for the thread that is to be joined.

### Returns

The function returns one of the following values:

- If successful, `PR_SUCCESS`
- If unsuccessful--for example, if no joinable thread can be found that
  corresponds to the specified target thread, or if the target thread
  is unjoinable--`PR_FAILURE`.

## Description

{doc}`pr_jointhread` is used to synchronize the termination of a thread.
The function is synchronous in that it blocks the calling thread until
the target thread is in a joinable state. {doc}`pr_jointhread` returns to
the caller only after the target thread returns from its root function.

{doc}`pr_jointhread` must not be called until after {doc}`pr_createthread` has
returned. If {doc}`pr_jointhread` is not called on the same thread as
{doc}`pr_createthread`, then it is the caller's responsibility to ensure
that {doc}`pr_createthread` has completed.

Several threads cannot wait for the same thread to complete. One of the
calling threads operates successfully, and the others terminate with the
error `PR_FAILURE`.

The calling thread is not blocked if the target thread has already
terminated.

{doc}`pr_jointhread` is interruptible.
