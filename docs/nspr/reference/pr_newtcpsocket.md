# PR_NewTCPSocket

Creates a new IPv4 TCP socket.

## Syntax

```{code}
#include <prio.h>

PRFileDesc* PR_NewTCPSocket(void);
```

### Returns

The function returns one of the following values:

- Upon successful completion, a pointer to the {doc}`prfiledesc` object
  created for the newly opened IPv4 TCP socket.
- If the creation of a new TCP socket failed, `NULL`.

## Description

TCP (Transmission Control Protocol) is a connection-oriented, reliable
byte-stream protocol of the TCP/IP protocol suite. {doc}`pr_newtcpsocket`
creates a new IPv4 TCP socket. A TCP connection is established by a
passive socket (the server) accepting a connection setup request from an
active socket (the client). Typically, the server binds its socket to a
well-known port with {doc}`pr_bind`, calls {doc}`pr_listen` to start listening
for connection setup requests, and calls {doc}`pr_accept` to accept a
connection. The client makes a connection request using {doc}`pr_connect`.

After a connection is established, the client and server may send and
receive data between each other. To receive data, one can call
{doc}`pr_read` or {doc}`pr_recv`. To send data, one can call {doc}`pr_write`,
{doc}`pr_writev`, {doc}`pr_send`, or {doc}`pr_transmitfile`. {doc}`pr_acceptread` is
suitable for use by the server to accept a new client connection and
read the client's first request in one function call.

A TCP connection can be shut down by {doc}`pr_shutdown`, and the sockets
should be closed by {doc}`pr_close`.

## See Also

{doc}`pr_newtcpsocket` is deprecated because it is hardcoded to create an
IPv4 TCP socket. New code should use {doc}`pr_opentcpsocket` instead, which
allows the address family (IPv4 or IPv6) of the new TCP socket to be
specified.
