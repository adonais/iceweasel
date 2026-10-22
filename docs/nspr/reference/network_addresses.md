This chapter describes the NSPR types and functions used to manipulate
network addresses.

- [Network Address Types and
  Constants](#network-address-types-and-constants)
- [Network Address Functions](#network-address-functions)

The API described in this chapter recognizes the emergence of Internet
Protocol Version 6 (IPv6). To facilitate the transition to IPv6, it is
recommended that clients treat all structures containing network
addresses as transparent objects and use the functions documented here
to manipulate the information.

If used consistently, this API also eliminates the need to deal with the
byte ordering of network addresses. Typically, the only numeric
declarations required are the well-known port numbers that are part of
the {doc}`prnetaddr` structure.

(network-address-types-and-constants)=

# Network Address Types and Constants

> - {doc}`prhostent`
> - {doc}`prprotoent`
> - {doc}`pr_netdb_buf_size`

(network-address-functions)=

# Network address functions

(initializing-a-network-address)=

## Initializing a network address

{doc}`pr_initializenetaddr` facilitates the use of {doc}`prnetaddr`, the basic
network address structure, in a polymorphic manner. By using these
functions with other network address functions, clients can support
either version 4 or version 6 of the Internet Protocol transparently.

All NSPR functions that require [PRNetAddr](prnetaddr.md) as an argument
accept either an IPv4 or IPv6 version of the address.

> - {doc}`pr_initializenetaddr`

(converting-between-a-string-and-a-network-address)=

## Converting between a string and a network address

> - {doc}`pr_stringtonetaddr`
> - {doc}`pr_netaddrtostring`

(converting-address-formats)=

## Converting address formats

> - {doc}`pr_convertipv4addrtoipv6`

(getting-host-names-and-addresses)=

## Getting host names and addresses

> - {doc}`pr_gethostbyname`
> - {doc}`pr_gethostbyaddr`
> - {doc}`pr_enumeratehostent`
> - {doc}`pr_getaddrinfobyname`
> - {doc}`pr_enumerateaddrinfo`
> - {doc}`pr_getcanonnamefromaddrinfo`
> - {doc}`pr_freeaddrinfo`

(getting-protocol-entries)=

## Getting protocol entries

> - {doc}`pr_getprotobyname`
> - {doc}`pr_getprotobynumber`
