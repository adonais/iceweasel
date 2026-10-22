# PR_GetInheritedFileMap

Imports a {doc}`prfilemap` previously exported by my parent process via
`PR_CreateProcess`.

## Syntax

```{code}
#include <prshma.h>

NSPR_API( PRFileMap *)
PR_GetInheritedFileMap(
  const char *shmname
);
```

### Parameter

The function has the following parameter:

`shmname`

: The name provided to {doc}`pr_processattrsetinheritablefilemap`.

### Returns

Pointer to {doc}`prfilemap` or `NULL` on error.

## Description

{doc}`pr_getinheritedfilemap` retrieves a PRFileMap object exported from
its parent process via `PR_CreateProcess`.

:::{note}
**Note:** This function is not implemented.
:::
