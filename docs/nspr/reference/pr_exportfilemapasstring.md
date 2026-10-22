# PR_ExportFileMapAsString

Creates a string identifying a {doc}`prfilemap`.

## Syntax

```{code}
#include <prshma.h>

NSPR_API( PRStatus )
PR_ExportFileMapAsString(
  PRFileMap *fm,
  PRSize bufsize,
  char *buf
);
```

1. define PR_FILEMAP_STRING_BUFSIZE 128

### Parameters

The function has the following parameters:

`fm`

: A pointer to the {doc}`prfilemap` to be represented as a string.

`bufsize`

: sizeof(buf)

`buf`

: A pointer to abuffer of length `PR_FILEMAP_STRING_BUFSIZE`.

### Returns

{doc}`prstatus`

## Description

Creates an identifier, as a string, from a {doc}`prfilemap` object
previously created with {doc}`pr_openanonfilemap`.
