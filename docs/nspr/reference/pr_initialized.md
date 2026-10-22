# PR_Initialized

Checks whether the runtime has been initialized.

## Syntax

```{code}
#include <prinit.h>

PRBool PR_Initialized(void);
```

### Returns

The function returns one of the following values:

- If {doc}`pr_init` has already been called, `PR_TRUE`.
- If {doc}`pr_init` has not already been called, `PR_FALSE`.
