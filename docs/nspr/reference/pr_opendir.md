# PR_OpenDir

Opens the directory with the specified pathname.

## Syntax

```{code}
#include <prio.h>

PRDir* PR_OpenDir(const char *name);
```

### Parameter

The function has the following parameter:

`name`

: The pathname of the directory to be opened.

### Returns

- If the directory is successfully opened, a {doc}`prdir` object is
  dynamically allocated and the function returns a pointer to it.
- If the directory cannot be opened, the function returns `NULL`.

## Description

{doc}`pr_opendir` opens the directory specified by the pathname `name`
and returns a pointer to a directory stream (a {doc}`prdir` object) that
can be passed to subsequent {doc}`pr_readdir` calls to get the directory
entries (files and subdirectories) in the directory. The {doc}`prdir`
pointer should eventually be closed by a call to {doc}`pr_closedir`.
