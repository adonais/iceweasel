# PR_PREV_LINK

Returns the preceding element in a list.

## Syntax

```{code}
#include <prclist.h>

PRCList *PR_PREV_LINK (PRCList *elemp);
```

### Parameter

`elemp`

: A pointer to the element.

### Returns

A pointer to a list element.

## Description

{doc}`pr_prev_link` returns a pointer to the element preceding the
specified element. It can be used to traverse a list. The preceding
element is not removed from the list.
