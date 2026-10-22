# PR_Lock

Locks a specified lock object.

## Syntax

```{code}
#include <prlock.h>

void PR_Lock(PRLock *lock);
```

### Parameter

{doc}`pr_lock` has one parameter:

`lock`

: A pointer to a lock object to be locked.

## Description

When {doc}`pr_lock` returns, the calling thread is "in the monitor," also
called "holding the monitor's lock." Any thread that attempts to acquire
the same lock blocks until the holder of the lock exits the monitor.
Acquiring the lock is not an interruptible operation, nor is there any
timeout mechanism.

{doc}`pr_lock` is not reentrant. Calling it twice on the same thread
results in undefined behavior.

## See Also

> - {doc}`pr_unlock`
