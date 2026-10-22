# PRThreadType

The type of an NSPR thread, specified as a parameter to
{doc}`pr_createthread`.

## Syntax

```{code}
#include <prthread.h>

typedef enum PRThreadType {
   PR_USER_THREAD,
   PR_SYSTEM_THREAD
} PRThreadType;
```

### Enumerators

`PR_USER_THREAD`

: {doc}`pr_cleanup` blocks until the last thread of type
  `PR_USER_THREAD` terminates.

`PR_SYSTEM_THREAD`

: NSPR ignores threads of type `PR_SYSTEM_THREAD` when determining
  when a call to {doc}`pr_cleanup` should return.

## Description

Threads can be either user threads or system threads. NSPR allows the
client to synchronize the termination of all user threads and ignores
those created as system threads. This arrangement implies that a system
thread should not have volatile data that needs to be safely stored
away. The applicability of system threads is somewhat dubious;
therefore, they should be used with caution.
