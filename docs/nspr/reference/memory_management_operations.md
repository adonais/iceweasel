This chapter describes the global functions and macros you use to
perform memory management. NSPR provides heap-based memory management
functions that map to the familiar `malloc()`, `calloc()`,
`realloc()`, and `free()`.

- [Memory Allocation Functions](#memory-allocation-functions)
- [Memory Allocation Macros](#memory-allocation-macros)

(memory-allocation-functions)=

# Memory Allocation Functions

NSPR has its own heap, and these functions act on that heap. Libraries
built on top of NSPR, such as the Netscape security libraries, use these
functions to allocate and free memory. If you are allocating memory for
use by such libraries or freeing memory that was allocated by such
libraries, you must use these NSPR functions rather than the libc
equivalents.

Memory allocation functions are:

> - {doc}`pr_malloc`
> - {doc}`pr_calloc`
> - {doc}`pr_realloc`
> - {doc}`pr_free`

`PR_Malloc()`, `PR_Calloc()`, `PR_Realloc()`, and `PR_Free()`
have the same signatures as their libc equivalents `malloc()`,
`calloc()`, `realloc()`, and `free()`, and have the same
semantics. (Note that the argument type `size_t` is replaced by
{doc}`pruint32`.) Memory allocated by `PR_Malloc()`, `PR_Calloc()`, or
`PR_Realloc()` must be freed by `PR_Free()`.

(memory-allocation-macros)=

# Memory Allocation Macros

Macro versions of the memory allocation functions are available, as well
as additional macros that provide programming convenience:

> - {doc}`pr_malloc`
> - {doc}`pr_new`
> - {doc}`pr_realloc`
> - {doc}`pr_calloc`
> - {doc}`pr_newzap`
> - {doc}`pr_delete`
> - {doc}`pr_freeif`
