# PR_ImportFileMapFromString

Creates a {doc}`prfilemap` from an identifying string.

## Syntax

```{code}
#include <prshma.h>

NSPR_API( PRFileMap * )
PR_ImportFileMapFromString(
  const char *fmstring
);
```

## Parameter

The function has the following parameter:

fmstring

: A pointer to string created by {doc}`pr_exportfilemapasstring`.

## Returns

{doc}`prfilemap` pointer or `NULL` on error.

### Description

{doc}`pr_importfilemapfromstring` creates a {doc}`prfilemap` object from a
string previously created by {doc}`pr_exportfilemapasstring`.
