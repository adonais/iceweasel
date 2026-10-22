# PR_GetConnectStatus

Get the completion status of a nonblocking connection.

## Syntax

```{code}
PRStatus PR_GetConnectStatus(const PRPollDesc *pd);
```

### Parameter

The function has the following parameter:

`pd`

: A pointer to a `PRPollDesc` structure whose `fd` field is the
  socket and whose `in_flags` field must contain `PR_POLL_WRITE`
  and `PR_POLL_EXCEPT`.

### Returns

The function returns one of these values:

- If successful, `PR_SUCCESS`.
- If unsuccessful, `PR_FAILURE`. The reason for the failure can be
  retrieved via {doc}`pr_geterror`.

If {doc}`pr_geterror` returns `PR_IN_PROGRESS_ERROR`, the nonblocking
connection is still in progress and has not completed yet.Other errors
indicate that the connection has failed.

## Description

After {doc}`pr_connect` on a nonblocking socket fails with
`PR_IN_PROGRESS_ERROR`, you may wait for the connection to complete by
calling {doc}`pr_poll` on the socket with the `in_flags`
`PR_POLL_WRITE` | `PR_POLL_EXCEPT`. When {doc}`pr_poll` returns, call
{doc}`pr_getconnectstatus` on the socket to determine whether the
nonblocking connect has succeeded or failed.
