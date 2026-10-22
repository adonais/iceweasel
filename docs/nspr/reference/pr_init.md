# PR_Init

Initializes the runtime.

## Syntax

```{code}
#include <prinit.h>

void PR_Init(
  PRThreadType type,
  PRThreadPriority priority,
  PRUintn maxPTDs);
```

### Parameters

{doc}`pr_init` has the following parameters:

`type`

: This parameter is ignored.

`priority`

: This parameter is ignored.

`maxPTDs`

: This parameter is ignored.

## Description

NSPR is now implicitly initialized, usually by the first NSPR function
called by a program. {doc}`pr_init` is necessary only if a program has
specific initialization-sequencing requirements.

Call {doc}`pr_init` as follows:

```{code}
PR_Init(PR_USER_THREAD, PR_PRIORITY_NORMAL, 0);
```
