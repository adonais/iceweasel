# PR_GetHostByAddr

Looks up a host entry by its network address.

## Syntax

```{code}
#include <prnetdb.h>

PRStatus PR_GetHostByAddr(
  const PRNetAddr *hostaddr,
  char *buf,
  PRIntn bufsize,
  PRHostEnt *hostentry);
```

### Parameters

The function has the following parameters:

`hostaddr`

: A pointer to the IP address of host in question.

`buf`

: A pointer to a buffer, allocated by the caller, that is filled in
  with host data on output. All of the pointers in the `hostentry`
  structure point to data saved in this buffer. This buffer is
  referenced by the runtime during a call to {doc}`pr_enumeratehostent`.

`bufsize`

: Number of bytes in the `buf` parameter. The buffer must be at least
  {doc}`pr_netdb_buf_size` bytes.

`hostentry`

: This structure is allocated by the caller. On output, this structure
  is filled in by the runtime if the function returns `PR_SUCCESS`.

### Returns

The function returns one of the following values:

- If successful, `PR_SUCCESS`.
- If unsuccessful, `PR_FAILURE`. You can retrieve the reason for the
  failure by calling {doc}`pr_geterror`.

### Description

{doc}`pr_gethostbyaddr` is used to perform reverse lookups of network
addresses. That is, given a valid network address (of type
{doc}`prnetaddr`), {doc}`pr_gethostbyaddr` discovers the address' primary
name, any aliases, and any other network addresses for the same host.
