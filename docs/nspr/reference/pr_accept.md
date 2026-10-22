# PR_Accept

Accepts a connection on a specified socket.

## Syntax

```{code}
#include <prio.h>

PRFileDesc* PR_Accept(
  PRFileDesc *fd,
  PRNetAddr *addr,
  PRIntervalTime timeout);
```

### Parameters

The function has the following parameters:

`fd`

: A pointer to a {doc}`prfiledesc` object representing the rendezvous
  socket on which the caller is willing to accept new connections.

`addr`

: A pointer to a structure of type {doc}`prnetaddr`. On output, this
  structure contains the address of the connecting entity.

`timeout`

: A value of type {doc}`printervaltime` specifying the time limit for
  completion of the accept operation.

### Returns

The function returns one of the following values:

- Upon successful acceptance of a connection, a pointer to a new
  {doc}`prfiledesc` structure representing the newly accepted connection.
- If unsuccessful, `NULL`. Further information can be obtained by
  calling {doc}`pr_geterror`.

## Description

The socket `fd` is a rendezvous socket that has been bound to an
address with {doc}`pr_bind` and is listening for connections after a call
to {doc}`pr_listen`. {doc}`pr_accept` accepts the first connection from the
queue of pending connections and creates a new socket for the newly
accepted connection. The rendezvous socket can still be used to accept
more connections.

If the `addr` parameter is not `NULL`, {doc}`pr_accept` stores the
address of the connecting entity in the {doc}`prnetaddr` object pointed to
by `addr`.

{doc}`pr_accept` blocks the calling thread until either a new connection is
successfully accepted or an error occurs. If the timeout parameter is
not `PR_INTERVAL_NO_TIMEOUT` and no pending connection can be accepted
before the time limit, {doc}`pr_accept` returns `NULL` with the error
code `PR_IO_TIMEOUT_ERROR`.
