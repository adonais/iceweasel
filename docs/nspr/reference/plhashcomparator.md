# PLHashComparator

(plhashcomparator-syntax)=

## Syntax

```{code}
#include <plhash.h>

typedef PRIntn (PR_CALLBACK *PLHashComparator)(
  const void *v1,
  const void *v2);
```

(plhashcomparator-description)=

## Description

{doc}`plhashcomparator` is a function type that compares two values of an
unspecified type. It returns a nonzero value if the two values are
equal, and 0 if the two values are not equal. {doc}`plhashcomparator`
defines the meaning of equality for the unspecified type.

For convenience, two comparator functions are provided.
{doc}`pl_comparestrings` compare two character strings using `strcmp`.
{doc}`pl_comparevalues` compares the values of the arguments v1 and v2
numerically.

(plhashcomparator-remark)=

## Remark

The return value of {doc}`plhashcomparator` functions should be of type
{doc}`prbool`.

(plhashcomparator-see-also)=

## See Also

{doc}`pl_comparestrings`, {doc}`pl_comparevalues`
