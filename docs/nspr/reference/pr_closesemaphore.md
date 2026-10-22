# PR_CloseSemaphore

Closes a specified semaphore.

## Syntax

```{code}
#include <pripcsem.h>

NSPR_API(PRStatus) PR_CloseSemaphore(PRSem *sem);
```

### Parameter

The function has the following parameter:

`sem`

: A pointer to a `PRSem` structure returned from a call to
  {doc}`pr_opensemaphore`.

### Returns

{doc}`prstatus`
