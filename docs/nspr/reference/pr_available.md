# PR_Available

Determines the number of bytes (expressed as a 32-bit integer) that are
available for reading beyond the current read-write pointer in a
specified file or socket.

## Syntax

```{code}
#include <prio.h>

PRInt32 PR_Available(PRFileDesc *fd);
```

### Parameter

The function has the following parameter:

`fd`

: Pointer to a {doc}`prfiledesc` object representing a file or socket.

### Returns

The function returns one of the following values:

- If the function completes successfully, it returns the number of
  bytes that are available for reading. For a normal file, these are
  the bytes beyond the current file pointer.
- If the function fails, it returns the value -1. The error code can
  then be retrieved via {doc}`pr_geterror`.

## Description

{doc}`pr_available` works on normal files and sockets. {doc}`pr_available`
does not work with pipes on Win32 platforms.

## See Also

If the number of bytes available for reading is out of the range of a
32-bit integer, use {doc}`pr_available64`.
