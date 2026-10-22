# PR_NETDB_BUF_SIZE

Recommended size to use when specifying a scratch buffer for
{doc}`pr_gethostbyname`, {doc}`pr_gethostbyaddr`, {doc}`pr_getprotobyname`, or
{doc}`pr_getprotobynumber`.

## Syntax

```{code}
#include <prnetdb.h>

#if defined(AIX) || defined(OSF1)
  #define PR_NETDB_BUF_SIZE sizeof(struct protoent_data)
#else
  #define PR_NETDB_BUF_SIZE 1024
#endif
```
