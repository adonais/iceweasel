# PRFileMap

Type returned by {doc}`pr_createfilemap` and passed to {doc}`pr_memmap` and
{doc}`pr_closefilemap`.

## Syntax

```{code}
#include <prio.h>

typedef struct PRFileMap PRFileMap;
```

## Description

The opaque structure {doc}`prfilemap` represents a memory-mapped file
object. Before actually mapping a file to memory, you must create a
memory-mapped file object by calling {doc}`pr_createfilemap`, which returns
a pointer to {doc}`prfilemap`. Then sections of the file can be mapped into
memory by passing the {doc}`prfilemap` pointer to {doc}`pr_memmap`. The
memory-mapped file object is closed by passing the {doc}`prfilemap` pointer
to {doc}`pr_closefilemap`.
