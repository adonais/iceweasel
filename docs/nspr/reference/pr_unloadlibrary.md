# PR_UnloadLibrary

Unloads a library loaded with {doc}`pr_loadlibrary`.

## Syntax

```{code}
#include <prlink.h>

PRStatus PR_UnloadLibrary(PRLibrary *lib);
```

### Parameters

The function has this parameter:

`lib`

: A reference previously returned from {doc}`pr_loadlibrary`.

### Returns

The function returns one of the following values:

- If successful, `PR_SUCCESS`.
- If unsuccessful, `PR_FAILURE`. Use {doc}`pr_geterror` to find the
  reason for the failure.

## Description

This function undoes the effect of a {doc}`pr_loadlibrary`. After calling
this function, future references to the library using its identity as
returned by {doc}`pr_loadlibrary` will be invalid.
