# PR_GetDescType

Describes what type of file is referenced by a specified file
descriptor.

## Syntax

```{code}
#include <prio.h>

PRDescType PR_GetDescType(PRFileDesc *file);
```

### Parameter

The function has the following parameter:

`file`

: A pointer to a {doc}`prfiledesc` object whose descriptor type is to be
  returned.

### Returns

The function returns a `PRDescType` enumeration constant that
describes the type of file.

## Description

The `PRDescType` enumeration is defined as follows:

```{code}
typedef enum PRDescType {
  PR_DESC_FILE       = 1,
  PR_DESC_SOCKET_TCP = 2,
  PR_DESC_SOCKET_UDP = 3,
  PR_DESC_LAYERED    = 4
} PRDescType;
```

The enumeration has the following enumerators:

`PR_DESC_FILE`

: The {doc}`prfiledesc` object represents a normal file.

`PR_DESC_SOCKET_TCP`

: The {doc}`prfiledesc` object represents a TCP socket.

`PR_DESC_SOCKET_UDP`

: The {doc}`prfiledesc` object represents a UDP socket.

`PR_DESC_LAYERED`

: The {doc}`prfiledesc` object is a layered file descriptor.
