This chapter describes the most common NSPR types, enumerations, and
structures used with the functions described in [I/O
Functions](i_o_functions.md) and [Network
Addresses](network_addresses.md). These include the types used for
system access, normal file I/O, and socket (network) I/O.

Types unique to a particular function are described with the function
itself.

For sample code that illustrates basic I/O operations, see [Introduction
to NSPR](introduction_to_nspr.md).

- [Directory Type](#directory-type)
- [File Descriptor Types](#file-descriptor-types)
- [File Info Types](#file-info-types)
- [Network Address Types](#network-address-types)
- [Types Used with Socket Options
  Functions](#types-used-with-socket-options-functions)
- [Type Used with Memory-Mapped
  I/O](#type-used-with-memory-mapped-io)
- [Offset Interpretation for Seek
  Functions](#offset-interpretation-for-seek-functions)

(directory-type)=

# Directory Type

> - {doc}`prdir`

(file-descriptor-types)=

# File Descriptor Types

NSPR represents I/O objects, such as open files and sockets, by file
descriptors of type {doc}`prfiledesc`. This section introduces
{doc}`prfiledesc` and related types.

> - {doc}`prfiledesc`
> - {doc}`priomethods`
> - {doc}`prfileprivate`
> - {doc}`prdescidentity`

Note that the NSPR documentation follows the Unix convention of using
the term*files* to refer to many kinds of I/O objects. To refer
specifically to the files in a file system (that is, disk files), this
documentation uses the term*normal files*.

{doc}`prfiledesc` has an object-oriented flavor. An I/O function on a
{doc}`prfiledesc` structure is carried out by invoking the corresponding
"method" in the I/O methods table (a structure of type {doc}`priomethods`)
of the {doc}`prfiledesc` structure (the "object"). Different kinds of I/O
objects (such as files and sockets) have different I/O methods tables,
thus implementing different behavior in response to the same I/O
function call.

NSPR supports the implementation of layered I/O. Each layer is
represented by a {doc}`prfiledesc` structure, and the {doc}`prfiledesc`
structures for the layers are chained together. Each {doc}`prfiledesc`
structure has a field (of type {doc}`prdescidentity`) to identify itself in
the layers. For example, the Netscape implementation of the Secure
Sockets Layer (SSL) protocol is implemented as an I/O layer on top of
NSPR's socket layer.

(file-info-types)=

# File Info Types

> - {doc}`prfileinfo`
> - {doc}`prfileinfo64`
> - {doc}`prfiletype`

(network-address-types)=

# Network Address Types

> - {doc}`prnetaddr`
> - {doc}`pripv6addr`

(types-used-with-socket-options-functions)=

# Types Used with Socket Options Functions

> - {doc}`prsocketoptiondata`
> - {doc}`prsockoption`
> - {doc}`prlinger`
> - {doc}`prmcastrequest`

(type-used-with-memory-mapped-i-2fo)=

# Type Used with Memory-Mapped I/O

> - {doc}`prfilemap`

(offset-interpretation-for-seek-functions)=

# Offset Interpretation for Seek Functions

> - {doc}`prseekwhence`
