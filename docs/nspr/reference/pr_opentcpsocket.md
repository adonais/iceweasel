# PR_OpenTCPSocket

Creates a new TCP socket of the specified address family.

## Syntax

```{code}
#include <prio.h>

PRFileDesc* PR_OpenTCPSocket(PRIntn af);
```

### Parameters

The function has the following parameters:

`af`

: The address family of the new TCP socket. Can be `PR_AF_INET`
  (IPv4), `PR_AF_INET6` (IPv6), or `PR_AF_LOCAL` (Unix domain,
  supported on POSIX systems only).

### Returns

The function returns one of the following values:

- Upon successful completion, a pointer to the {doc}`prfiledesc` object
  created for the newly opened TCP socket.
- If the creation of a new TCP socket failed, `NULL`.

## Description

TCP (Transmission Control Protocol) is a connection-oriented, reliable
byte-stream protocol of the TCP/IP protocol suite. {doc}`pr_opentcpsocket`
creates a new TCP socket of the address family `af`. A TCP connection
is established by a passive socket (the server) accepting a connection
setup request from an active socket (the client). Typically, the server
binds its socket to a well-known port with {doc}`pr_bind`, calls
{doc}`pr_listen` to start listening for connection setup requests, and
calls {doc}`pr_accept` to accept a connection. The client makes a
connection request using {doc}`pr_connect`.

After a connection is established, the client and server may send and
receive data between each other. To receive data, one can call
{doc}`pr_read` or {doc}`pr_recv`. To send data, one can call {doc}`pr_write`,
{doc}`pr_writev`, {doc}`pr_send`, or {doc}`pr_transmitfile`. {doc}`pr_acceptread` is
suitable for use by the server to accept a new client connection and
read the client's first request in one function call.

A TCP connection can be shut down by {doc}`pr_shutdown`, and the sockets
should be closed by {doc}`pr_close`.
