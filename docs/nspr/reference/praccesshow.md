# PRAccessHow

This is the declaration for the enumeration {doc}`praccesshow`, used in the
`how` parameter of {doc}`pr_access`:

```{code}
#include <prio.h>

typedef enum PRAccessHow {
  PR_ACCESS_EXISTS = 1,
  PR_ACCESS_WRITE_OK = 2,
  PR_ACCESS_READ_OK = 3
} PRAccessHow;
```

See [PR_Access](pr_access.md) for what each of these values mean.
