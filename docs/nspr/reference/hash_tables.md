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
> - {ref}`PLHashTable`
> - `PLHashNumber`
> - `PLHashFunction`
> - {ref}`PLHashComparator`
> - `PLHashEnumerator`
> - `PLHashAllocOps`

(hash-table-functions)=

# Hash Table Functions

> - {ref}`PL_NewHashTable`
> - {ref}`PL_HashTableDestroy`
> - {ref}`PL_HashTableAdd`
> - {ref}`PL_HashTableRemove`
> - {ref}`PL_HashTableLookup`
> - {ref}`PL_HashTableEnumerateEntries`
> - {ref}`PL_HashString`
> - {ref}`PL_CompareStrings`
> - {ref}`PL_CompareValues`
