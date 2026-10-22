# I/O functions

This chapter describes the NSPR functions used to perform operations
such as system access, normal file I/O, and socket (network) I/O.

For sample code that illustrates basic I/O operations, see {doc}`introduction_to_nspr`.
For information about the types most
commonly used with the functions described in this chapter, see [I/O
Types](i_o_types.md).

- [Functions that Operate on
  Pathnames](#functions-that-operate-on-pathnames)
- [Functions that Act on File
  Descriptors](#functions-that-act-on-file-descriptors)
- [Directory I/O Functions](#directory-io-functions)
- [Socket Manipulation Functions](#socket-manipulation-functions)
- [Converting Between Host and Network
  Addresses](#converting-between-host-and-network-addresses)
- [Memory-Mapped I/O Functions](#memory-mapped-io-functions)
- [Anonymous Pipe Function](#anonymous-pipe-function)
- [Polling Functions](#polling-functions)
- [Manipulating Layers](#manipulating-layers)

(functions-that-operate-on-pathnames)=

## Functions that Operate on Pathnames

A file or directory in a file system is specified by its pathname. NSPR
uses Unix-style pathnames, which are null-terminated character strings.
Only the ASCII character set is supported. The forward slash (/)
separates the directories in a pathname. NSPR converts the slashes in a
pathname to the directory separator of the native OS--for example,
backslash () on Windows and colon (:) on Mac OS--before passing it to
the native system calls.

Some file systems also differentiate drives or volumes.

- {doc}`pr_open`

- {doc}`pr_delete`

- {doc}`pr_getfileinfo`

- {doc}`pr_getfileinfo64`

- {doc}`pr_rename`

- {doc}`pr_access`

  - type {doc}`praccesshow`

(functions-that-act-on-file-descriptors)=

## Functions that Act on File Descriptors

- {doc}`pr_close`
- {doc}`pr_read`
- {doc}`pr_write`
- {doc}`pr_writev`
- {doc}`pr_getopenfileinfo`
- {doc}`pr_getopenfileinfo64`
- {doc}`pr_seek`
- {doc}`pr_seek64`
- {doc}`pr_available`
- {doc}`pr_available64`
- {doc}`pr_sync`
- {doc}`pr_getdesctype`
- {doc}`pr_getspecialfd`
- {doc}`pr_createpipe`

(directory-i-2fo-functions)=

## Directory I/O Functions

- {doc}`pr_opendir`
- {doc}`pr_readdir`
- {doc}`pr_closedir`
- {doc}`pr_mkdir`
- {doc}`pr_rmdir`

(socket-manipulation-functions)=

## Socket Manipulation Functions

The network programming interface presented here is a socket API modeled
after the popular Berkeley sockets. Differences include the following:

- The blocking socket functions in NSPR take a timeout parameter.
- Two new functions, {doc}`pr_transmitfile` and {doc}`pr_acceptread`, can
  exploit the new system calls of some operating systems for higher
  performance.

List of functions:

- {doc}`pr_openudpsocket`
- {doc}`pr_newudpsocket`
- {doc}`pr_opentcpsocket`
- {doc}`pr_newtcpsocket`
- {doc}`pr_importtcpsocket`
- {doc}`pr_connect`
- {doc}`pr_connectcontinue`
- {doc}`pr_accept`
- {doc}`pr_bind`
- {doc}`pr_listen`
- {doc}`pr_shutdown`
- {doc}`pr_recv`
- {doc}`pr_send`
- {doc}`pr_recvfrom`
- {doc}`pr_sendto`
- {doc}`pr_transmitfile`
- {doc}`pr_acceptread`
- {doc}`pr_getsockname`
- {doc}`pr_getpeername`
- {doc}`pr_getsocketoption`
- {doc}`pr_setsocketoption`

(converting-between-host-and-network-addresses)=

## Converting Between Host and Network Addresses

- {doc}`pr_ntohs`
- {doc}`pr_ntohl`
- {doc}`pr_htons`
- {doc}`pr_htonl`
- {doc}`pr_familyinet`

(memory-mapped-i-2fo-functions)=

## Memory-Mapped I/O Functions

The memory-mapped I/O functions allow sections of a file to be mapped to
memory regions, allowing read-write accesses to the file to be
accomplished by normal memory accesses.

Memory-mapped I/O functions are currently implemented for Unix, Linux,
Mac OS X, and Win32 only.

- {doc}`pr_createfilemap`
- {doc}`pr_memmap`
- {doc}`pr_unmap`
- {doc}`pr_closefilemap`

(anonymous-pipe-function)=

## Anonymous Pipe Function

- {doc}`pr_createpipe`

(polling-functions)=

## Polling Functions

This section describes two of the most important polling functions
provided by NSPR:

- {doc}`pr_poll`
- {doc}`pr_getconnectstatus`

(manipulating-layers)=

## Manipulating Layers

File descriptors may be layered. For example, SSL is a layer on top of a
reliable bytestream layer such as TCP.

Each type of layer has a unique identity, which is allocated by the
runtime. The layer implementer should associate the identity with all
layers of that type. It is then possible to scan the chain of layers and
find a layer that one recognizes and therefore predict that it will
implement a desired protocol.

A layer can be pushed onto or popped from an existing stack of layers.
The file descriptor of the top layer can be passed to NSPR I/O
functions, which invoke the appropriate version of the I/O methods
polymorphically.

NSPR defines three identities:

```{code}
#define PR_INVALID_IO_LAYER (PRDescIdentity)-1
#define PR_TOP_IO_LAYER (PRDescIdentity)-2
#define PR_NSPR_IO_LAYER (PRDescIdentity)0
```

- `PR_INVALID_IO_LAYER`: An invalid layer identify (for error
  return).
- `PR_TOP_IO_LAYER`: The identity of the top of the stack.
- `PR_NSPR_IO_LAYER`: The identity for the layer implemented by NSPR.

`PR_TOP_IO_LAYER` may be used as a shorthand for identifying the
topmost layer of an existing stack. For example, the following lines of
code are equivalent:

`rv = PR_PushIOLayer(stack, PR_TOP_IO_LAYER, my_layer);`

`rv = PR_PushIOLayer(stack, PR_GetLayersIdentity(stack), my_layer);`

- {doc}`pr_getuniqueidentity`
- {doc}`pr_getnameforidentity`
- {doc}`pr_getlayersidentity`
- {doc}`pr_getidentitieslayer`
- {doc}`pr_getdefaultiomethods`
- {doc}`pr_createiolayerstub`
- {doc}`pr_pushiolayer`
- {doc}`pr_popiolayer`
