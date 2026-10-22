# PRFileDesc

A file descriptor used to represent any open file, such as a normal
file, an end point of a pipe, or a socket (end point of network
communication).

## Syntax

```{code}
#include <prio.h>

struct PRFileDesc {
  PRIOMethods *methods;
  PRFilePrivate *secret;
  PRFileDesc *lower, *higher;
  void (*dtor)(PRFileDesc *fd);
  PRDescIdentity identity;
};

typedef struct PRFileDesc PRFileDesc;
```

### Parameters

`methods`

: The I/O methods table. See {doc}`priomethods`.

`secret`

: Layer-dependent implementation data. See {doc}`prfileprivate`.

`lower`

: Pointer to lower layer.

`higher`

: Pointer to higher layer.

`dtor`

: A destructor function for the layer.

`identity`

: Identity of this particular layer. See {doc}`prdescidentity`.

## Description

The fields of this structure are significant only if you are
implementing a layer on top of NSPR, such as SSL. Otherwise, you use
functions such as {doc}`pr_open` and {doc}`pr_newtcpsocket` to obtain a file
descriptor, which you should treat as an opaque structure.

For more details about the use of {doc}`prfiledesc` and related structures,
see [File Descriptor Types](i_o_types.md#file-descriptor-types).
