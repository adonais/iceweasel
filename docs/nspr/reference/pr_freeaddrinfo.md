# PR_FreeAddrInfo

Destroys the `PRAddrInfo` structure returned by
{doc}`pr_getaddrinfobyname`.

## Syntax

```{code}
#include <prnetdb.h>

void PR_EnumerateAddrInfo(PRAddrInfo *addrInfo);
```

### Parameters

The function has the following parameters:

`addrInfo`

: A pointer to a `PRAddrInfo` structure returned by a successful call
  to {doc}`pr_getaddrinfobyname`.

### Returns

The function doesn't return anything.
