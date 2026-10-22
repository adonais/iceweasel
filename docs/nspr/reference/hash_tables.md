This chapter describes the hash table functions in the plds (portable
library — data structures) library of NSPR. The hash table library
functions are declared in the header file `plhash.h.`

:::{warning}
**Warning**: The NSPR hash table library functions are not thread
safe.
:::

A hash table lookup may change the internal organization of the hash
table (to speed up future lookups).

- [Hash Table Types and Constants](#hash-table-types-and-constants)
- [Hash Table Functions](#hash-table-functions)

(hash-table-types-and-constants)=

# Hash Table Types and Constants

> - `PLHashEntry`
> - {doc}`plhashtable`
> - `PLHashNumber`
> - `PLHashFunction`
> - {doc}`plhashcomparator`
> - `PLHashEnumerator`
> - `PLHashAllocOps`

(hash-table-functions)=

# Hash Table Functions

> - {doc}`pl_newhashtable`
> - {doc}`pl_hashtabledestroy`
> - {doc}`pl_hashtableadd`
> - {doc}`pl_hashtableremove`
> - {doc}`pl_hashtablelookup`
> - {doc}`pl_hashtableenumerateentries`
> - {doc}`pl_hashstring`
> - {doc}`pl_comparestrings`
> - {doc}`pl_comparevalues`
