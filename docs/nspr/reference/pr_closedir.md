# PR_CloseDir

Closes the specified directory.

## Syntax

```{code}
#include <prio.h>

PRStatus PR_CloseDir(PRDir *dir);
```

### Parameter

The function has the following parameter:

`dir`

: A pointer to a {doc}`prdir` structure representing the directory to be
  closed.

### Returns

- If successful, `PR_SUCCESS`.
- If unsuccessful, `PR_FAILURE`. The reason for the failure can be
  retrieved via {doc}`pr_geterror`.

## Description

When a {doc}`prdir` object is no longer needed, it must be closed and freed
with a call to {doc}`pr_closedir` call. Note that after a {doc}`pr_closedir`
call, any `PRDirEntry` object returned by a previous {doc}`pr_readdir`
call on the same {doc}`prdir` object becomes invalid.

## See Also

{doc}`pr_opendir`
