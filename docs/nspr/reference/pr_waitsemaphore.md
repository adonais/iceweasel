# PR_WaitSemaphore

Returns the value of the environment variable.

## Syntax

```{code}
#include <pripcsem.h>

NSPR_API(PRStatus) PR_WaitSemaphore(PRSem *sem);
```

### Parameter

The function has the following parameter:

`sem`

: A pointer to a `PRSem` structure returned from a call to
  {doc}`pr_opensemaphore`.

### Returns

{doc}`prstatus`

## Description

{doc}`pr_waitsemaphore` tests the value of the semaphore. If the value of
the semaphore is > 0, the value of the semaphore is decremented and the
function returns. If the value of the semaphore is 0, the function
blocks until the value becomes > 0, then the semaphore is decremented
and the function returns.

The "test and decrement" operation is performed atomically.
