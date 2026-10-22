# PR_GetDefaultIOMethods

Gets the default I/O methods table.

## Syntax

```{code}
#include <prio.h>

const PRIOMethods* PR_GetDefaultIOMethods(void);
```

### Returns

If successful, the function returns a pointer to a {doc}`priomethods`
structure.

## Description

After using {doc}`pr_getdefaultiomethods` to identify the default I/O
methods table, you can select elements from that table with which to
build your own layer's methods table. You may not modify the default I/O
methods table directly. You can pass your own layer's methods table to
{doc}`pr_createiolayerstub` to create your new layer.
