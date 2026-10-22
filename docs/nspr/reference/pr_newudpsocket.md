# PR_NewUDPSocket

Creates a new UDP socket.

## Syntax

```{code}
#include <prio.h>

PRFileDesc* PR_NewUDPSocket(void);
```

### Returns

The function returns one of the following values:

- Upon successful completion, a pointer to the {doc}`prfiledesc` object
  created for the newly opened UDP socket.
- If the creation of a new UDP socket failed, `NULL`.

## Description

UDP (User Datagram Protocol) is a connectionless, unreliable datagram
protocol of the TCP/IP protocol suite. UDP datagrams may be lost or
delivered in duplicates or out of sequence.

{doc}`pr_newudpsocket` creates a new UDP socket. The socket may be bound to
a well-known port number with {doc}`pr_bind`. Datagrams can be sent with
{doc}`pr_sendto` and received with {doc}`pr_recvfrom`. When the socket is no
longer needed, it should be closed with a call to {doc}`pr_close`.

## See Also

{doc}`pr_newudpsocket` is deprecated because it is hardcoded to create an
IPv4 UDP socket. New code should use {doc}`pr_openudpsocket` instead, which
allows the address family (IPv4 or IPv6) of the new UDP socket to be
specified.
