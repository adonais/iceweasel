# PR_RmDir

Removes a directory with a specified name.

## Syntax

```{code}
#include <prio.h>

PRStatus PR_RmDir(const char *name);
```

### Parameter

The function has the following parameter:

`name`

: The name of the directory to be removed.

### Returns

- If successful, `PR_SUCCESS`.
- If unsuccessful, `PR_FAILURE`. The actual reason can be retrieved
  via {doc}`pr_geterror`.

## Description

{doc}`pr_rmdir` removes the directory specified by the pathname `name`.
The directory must be empty. If the directory is not empty, {doc}`pr_rmdir`
fails and {doc}`pr_geterror` returns the error code
`PR_DIRECTORY_NOT_EMPTY_ERROR`.

## See Also

{doc}`pr_mkdir`
