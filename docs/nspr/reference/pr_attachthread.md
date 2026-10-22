# PR_AttachThread

:::{container} blockIndicator obsolete obsoleteHeader
**Obsolete**

This feature is obsolete. Although it may still work in some
browsers, its use is discouraged since it could be removed at any
time. Try to avoid using it.
:::

Associates a {doc}`prthread` object with an existing native thread.

## Syntax

```{code}
#include <pprthread.h>

PRThread* PR_AttachThread(
   PRThreadType type,
   PRThreadPriority priority,
   PRThreadStack *stack);
```

### Parameters

{doc}`pr_attachthread` has the following parameters:

`type`

: Specifies that the thread is either a user thread
  (`PR_USER_THREAD`) or a system thread (`PR_SYSTEM_THREAD`).

`priority`

: The priority to assign to the thread being attached.

`stack`

: The stack for the thread being attached.

### Returns

The function returns one of these values:

- If successful, a pointer to a {doc}`prthread` object.
- If unsuccessful, for example if system resources are not available,
  `NULL`.

## Description

You use {doc}`pr_attachthread` when you want to use NSS functions on the
native thread that was not created with NSPR. {doc}`pr_attachthread`
informs NSPR about the new thread by associating a {doc}`prthread` object
with the native thread.

The thread object is automatically destroyed when it is no longer
needed.

You don't need to call {doc}`pr_attachthread` unless you create your own
native thread. {doc}`pr_init` calls {doc}`pr_attachthread` automatically for
the primordial thread.

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
