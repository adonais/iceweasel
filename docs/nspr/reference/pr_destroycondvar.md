# PR_DestroyCondVar

Destroys a condition variable.

## Syntax

```{code}
#include <prcvar.h>

void PR_DestroyCondVar(PRCondVar *cvar);
```

### Parameter

{doc}`pr_destroycondvar` has one parameter:

`cvar`

: A pointer to the condition variable object to be destroyed.

## Description

Before calling {doc}`pr_destroycondvar`, the caller is responsible for
ensuring that the condition variable is no longer in use.
