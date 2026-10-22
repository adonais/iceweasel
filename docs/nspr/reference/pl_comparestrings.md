# PL_CompareStrings

Compares two character strings.

## Syntax

```{code}
#include <plhash.h>

PRIntn PL_CompareStrings(
  const void *v1,
  const void *v2);
```

## Description

{doc}`pl_comparestrings` compares `v1` and `v2` as character strings
using `strcmp`. If the two strings are equal, it returns 1. If the two
strings are not equal, it returns 0.

{doc}`pl_comparestrings` can be used as the comparator function for
string-valued key or entry value.
