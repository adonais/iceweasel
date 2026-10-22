# PRDir

Directory structure used with [Directory I/O
Functions](i_o_functions.md#directory-io-functions).

## Syntax

```{code}
#include <prio.h>

typedef struct PRDir PRDir;
```

## Description

The opaque structure {doc}`prdir` represents an open directory in the file
system. The function {doc}`pr_opendir` opens a specified directory and
returns a pointer to a {doc}`prdir` structure, which can be passed to
{doc}`pr_readdir` repeatedly to obtain successive entries (files or
subdirectories in the open directory). To close the directory, pass the
{doc}`prdir` pointer to {doc}`pr_closedir`.
