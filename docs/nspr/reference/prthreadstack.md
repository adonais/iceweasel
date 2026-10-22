# PRThreadStack

:::{container} blockIndicator obsolete obsoleteHeader
**Obsolete**

This feature is obsolete. Although it may still work in some
browsers, its use is discouraged since it could be removed at any
time. Try to avoid using it.
:::

The opaque {doc}`prthreadstack` structure is only used in the third
argument "`PRThreadStack *stack`" to the {doc}`pr_attachthread` function.
The '`stack`' argument is now obsolete and ignored by
{doc}`pr_attachthread`. You should pass `NULL` as the 'stack' argument to
{doc}`pr_attachthread`.

(definition)=

## Syntax

```{code}
#include <prthread.h>

typedef struct PRThreadStack PRThreadStack;
```

(definition-2)=

-
