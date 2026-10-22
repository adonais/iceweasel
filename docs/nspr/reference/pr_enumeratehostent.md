# PR_EnumerateHostEnt

Evaluates each of the possible addresses of a {doc}`prhostent` structure,
acquired from {doc}`pr_gethostbyname` or {doc}`pr_gethostbyaddr`.

## Syntax

```{code}
#include <prnetdb.h>

PRIntn PR_EnumerateHostEnt(
  PRIntn enumIndex,
  const PRHostEnt *hostEnt,
  PRUint16 port,
  PRNetAddr *address);
```

### Parameters

The function has the following parameters:

`enumIndex`

: The index of the enumeration. To begin an enumeration, this argument
  is set to zero. To continue an enumeration (thereby getting
  successive addresses from the host entry structure), the value should
  be set to the function's last returned value. The enumeration is
  complete when a value of zero is returned.

`hostEnt`

: A pointer to a {doc}`prhostent` structure obtained from
  {doc}`pr_gethostbyname` or {doc}`pr_gethostbyaddr`.

`port`

: The port number to be assigned as part of the {doc}`prnetaddr`
  structure. This parameter is not checked for validity.

`address`

: On input, a pointer to a {doc}`prnetaddr` structure. On output, this
  structure is filled in by the runtime if the result of the call is
  greater than 0.

### Returns

The function returns one of the following values:

- If successful, the function returns the value you should specify in
  the `enumIndex` parameter for the next call of the enumerator. If
  the function returns 0, the enumeration is ended.
- If unsuccessful, the function returns -1. You can retrieve the reason
  for the failure by calling {doc}`pr_geterror`.

## Description

{doc}`pr_enumeratehostent` is a stateless enumerator. The principle input,
the {doc}`prhostent` structure, is not modified.
