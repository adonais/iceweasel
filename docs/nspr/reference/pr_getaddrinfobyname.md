# PR_GetAddrInfoByName

Looks up a host by name. Equivalent to `getaddrinfo(host, NULL, ...)`
of RFC 3493.

## Syntax

```{code}
#include <prnetdb.h>

PRAddrInfo *PR_GetAddrInfoByName(
  const char *hostname,
  PRUint16 af,
  PRIntn flags);
```

### Parameters

The function has the following parameters:

`hostname`

: The character string defining the host name of interest.

`af`

: The address family. May be `PR_AF_UNSPEC` or `PR_AF_INET`.

`flags`

: May be either `PR_AI_ADDRCONFIG` or
  `PR_AI_ADDRCONFIG | PR_AI_NOCANONNAME`. Include
  `PR_AI_NOCANONNAME` to suppress the determination of the canonical
  name corresponding to `hostname`

### Returns

The function returns one of the following values:

- If successful, a pointer to the opaque `PRAddrInfo` structure
  containing the results of the host lookup. Use
  {doc}`pr_enumerateaddrinfo` to inspect the {doc}`prnetaddr` values stored
  in this structure. When no longer needed, this pointer must be
  destroyed with a call to {doc}`pr_freeaddrinfo`.
- If unsuccessful, `NULL`. You can retrieve the reason for the
  failure by calling {doc}`pr_geterror`.
