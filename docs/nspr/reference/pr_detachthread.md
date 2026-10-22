# PR_DetachThread

:::{container} blockIndicator obsolete obsoleteHeader
**Obsolete**

This feature is obsolete. Although it may still work in some
browsers, its use is discouraged since it could be removed at any
time. Try to avoid using it.
:::

Disassociates a PRThread object from a native thread.

## Syntax

```{code}
#include <pprthread.h>

void PR_DetachThread(void);
```

### Parameters

PR_DetachThread has no parameters.

### Returns

The function returns nothing.

## Description

This function detaches the NSPR thread from the currently executing
native thread. The thread object and all related data attached to it are
destroyed. The exit process is invoked. The call returns after the NSPR
thread object is destroyed.

This call is needed only if you attached the thread using
{doc}`pr_attachthread`.

:::{note}
As of NSPR release v3.0, {doc}`pr_attachthread` and
{doc}`pr_detachthread` are obsolete. A native thread not created by NSPR
is automatically attached the first time it calls an NSPR function,
and automatically detached when it exits.
:::

In NSPR release 19980529B and earlier, it is necessary for a native
thread not created by NSPR to call {doc}`pr_attachthread` before it calls
any NSPR functions, and call {doc}`pr_detachthread` when it is done calling
NSPR functions.
