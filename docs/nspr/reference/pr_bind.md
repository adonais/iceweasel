# PR_Bind

Binds an address to a specified socket.

## Syntax

```{code}
#include <prio.h>

PRStatus PR_Bind(
  PRFileDesc *fd,
  const PRNetAddr *addr);
```

### Parameters

The function has the following parameters:

`fd`

: A pointer to a {doc}`prfiledesc` object representing a socket.

`addr`

: A pointer to a {doc}`prnetaddr` object representing the address to which
  the socket will be bound.

### Returns

The function returns one of the following values:

- Upon successful binding of an address to a socket, `PR_SUCCESS`.
- If unsuccessful, `PR_FAILURE`. Further information can be obtained
  by calling {doc}`pr_geterror`.

## Description

When a new socket is created, it has no address bound to it. {doc}`pr_bind`
assigns the specified address (also known as name) to the socket. If you
do not care about the exact IP address assigned to the socket, set the
`inet.ip` field of {doc}`prnetaddr` to {doc}`pr_htonl`(`PR_INADDR_ANY`).
If you do not care about the TCP/UDP port assigned to the socket, set
the `inet.port` field of {doc}`prnetaddr` to 0.

Note that if {doc}`pr_connect` is invoked on a socket that is not bound, it
implicitly binds an arbitrary address the socket.

Call {doc}`pr_getsockname` to obtain the address (name) bound to a socket.
