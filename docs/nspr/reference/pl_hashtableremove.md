# PL_HashTableRemove

Removes the entry with the specified key from the hash table.

## Syntax

```{code}
#include <plhash.h>

PRBool PL_HashTableRemove(
  PLHashTable *ht,
  const void *key);
```

### Parameters

The function has the following parameters:

`ht`

: A pointer to the hash table from which to remove the entry.

`key`

: A pointer to the key for the entry to be removed.

## Description

If there is no entry in the table with the specified key,
{doc}`pl_hashtableremove` returns `PR_FALSE`. If the entry exists,
{doc}`pl_hashtableremove` removes the entry from the table, invokes
`freeEntry` with the `HT_FREE_ENTRY` flag to frees the entry, and
returns `PR_TRUE`.

If the table is underloaded, {doc}`pl_hashtableremove` also shrinks the
number of buckets by half.

## Remark

This function should return {doc}`prstatus`.
