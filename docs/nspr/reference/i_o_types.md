This chapter describes the most common NSPR types, enumerations, and
structures used with the functions described in [I/O
Functions](I%2f%2fO_Functions) and [Network
Addresses](Network_Addresses). These include the types used for
system access, normal file I/O, and socket (network) I/O.

Types unique to a particular function are described with the function
itself.

For sample code that illustrates basic I/O operations, see [Introduction
to NSPR](Introduction_to_NSPR).

- [Directory Type](#Directory_Type)
- [File Descriptor Types](#File_Descriptor_Types)
- [File Info Types](#File_Info_Types)
- [Network Address Types](#Network_Address_Types)
- [Types Used with Socket Options
  Functions](#Types_Used_with_Socket_Options_Functions)
- [Type Used with Memory-Mapped
  I/O](#Type_Used_with_Memory-Mapped_I/O)
- [Offset Interpretation for Seek
  Functions](#Offset_Interpretation_for_Seek_Functions)

(directory-type)=

# Directory Type

> - {ref}`PRDir`

(file-descriptor-types)=

# File Descriptor Types

NSPR represents I/O objects, such as open files and sockets, by file
descriptors of type {ref}`PRFileDesc`. This section introduces
{ref}`PRFileDesc` and related types.

> - {ref}`PRFileDesc`
> - {ref}`PRIOMethods`
> - {ref}`PRFilePrivate`
> - {ref}`PRDescIdentity`

Note that the NSPR documentation follows the Unix convention of using
the term*files* to refer to many kinds of I/O objects. To refer
specifically to the files in a file system (that is, disk files), this
documentation uses the term*normal files*.

{ref}`PRFileDesc` has an object-oriented flavor. An I/O function on a
{ref}`PRFileDesc` structure is carried out by invoking the corresponding
"method" in the I/O methods table (a structure of type {ref}`PRIOMethods`)
of the {ref}`PRFileDesc` structure (the "object"). Different kinds of I/O
objects (such as files and sockets) have different I/O methods tables,
thus implementing different behavior in response to the same I/O
function call.

NSPR supports the implementation of layered I/O. Each layer is
represented by a {ref}`PRFileDesc` structure, and the {ref}`PRFileDesc`
structures for the layers are chained together. Each {ref}`PRFileDesc`
structure has a field (of type {ref}`PRDescIdentity`) to identify itself in
the layers. For example, the Netscape implementation of the Secure
Sockets Layer (SSL) protocol is implemented as an I/O layer on top of
NSPR's socket layer.

(file-info-types)=

# File Info Types

> - {ref}`PRFileInfo`
> - {ref}`PRFileInfo64`
> - {ref}`PRFileType`

(network-address-types)=

# Network Address Types

> - {ref}`PRNetAddr`
> - {ref}`PRIPv6Addr`

(types-used-with-socket-options-functions)=

# Types Used with Socket Options Functions

> - {ref}`PRSocketOptionData`
> - {ref}`PRSockOption`
> - {ref}`PRLinger`
> - {ref}`PRMcastRequest`

(type-used-with-memory-mapped-i-2fo)=

# Type Used with Memory-Mapped I/O

> - {ref}`PRFileMap`

(offset-interpretation-for-seek-functions)=

# Offset Interpretation for Seek Functions

> - {ref}`PRSeekWhence`
