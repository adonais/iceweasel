# PR_GetCurrentThread

Returns the current thread object for the currently running code.

## Syntax

```{code}
#include <prthread.h>

PRThread* PR_GetCurrentThread(void);
```

### Returns

Always returns a valid reference to the calling thread--a self-identity.

### Description

The currently running thread may discover its own identity by calling
{doc}`pr_getcurrentthread`.

:::{note}
This is the only safe way to establish the identity of a
thread. Creation and enumeration are both subject to race conditions.
:::
