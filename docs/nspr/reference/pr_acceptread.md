# PR_AcceptRead

Accepts a new connection and receives a block of data.

## Syntax

```{code}
#include <prio.h>

PRInt32 PR_AcceptRead(
  PRFileDesc *listenSock,
  PRFileDesc **acceptedSock,
  PRNetAddr **peerAddr,
  void *buf,
  PRInt32 amount,
  PRIntervalTime timeout);
```

### Parameters

The function has the following parameters:

`listenSock`

: A pointer to a {doc}`prfiledesc` object representing a socket descriptor
  that has been called with the {doc}`pr_listen` function, also known as
  the rendezvous socket.

`acceptedSock`

: A pointer to a pointer to a {doc}`prfiledesc` object. On return,
  `*acceptedSock` points to the {doc}`prfiledesc` object for the newly
  connected socket. This parameter is valid only if the function return
  does not indicate failure.

`peerAddr`

: A pointer a pointer to a {doc}`prnetaddr` object. On return,
  `peerAddr` points to the address of the remote socket. The
  {doc}`prnetaddr` object that `peerAddr` points to will be in the
  buffer pointed to by `buf`. This parameter is valid only if the
  function return does not indicate failure.

`buf`

: A pointer to a buffer to hold data sent by the peer and the peer's
  address. This buffer must be large enough to receive `amount` bytes
  of data and two {doc}`prnetaddr` structures (thus allowing the runtime
  to align the addresses as needed).

`amount`

: The number of bytes of data to receive. Does not include the size of
  the {doc}`prnetaddr` structures. If 0, no data will be read from the
  peer.

`timeout`

: The timeout interval only applies to the read portion of the
  operation. {doc}`pr_acceptread` blocks indefinitely until the connection
  is accepted; the read will time out after the timeout interval
  elapses.

### Returns

- A positive number indicates the number of bytes read from the peer.
- The value -1 indicates a failure. The reason for the failure can be
  obtained by calling {doc}`pr_geterror`.

## Description

{doc}`pr_acceptread` accepts a new connection and retrieves the newly
created socket's descriptor and the connecting peer's address. Also, as
its name suggests, {doc}`pr_acceptread` receives the first block of data
sent by the peer.
