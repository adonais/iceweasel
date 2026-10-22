This chapter describes the NSPR API for using interprocess communication
semaphores.

NSPR provides an interprocess communication mechanism using a counting
semaphore model similar to that which is provided in Unix and Windows
platforms.

:::{note}
**Note:** See also [Named Shared Memory](named_shared_memory.md)
:::

- [IPC Semaphore Functions](#ipc-semaphore-functions)

(ipc-semaphore-functions)=

# IPC Semaphore Functions

> - {doc}`pr_opensemaphore`
> - {doc}`pr_waitsemaphore`
> - {doc}`pr_postsemaphore`
> - {doc}`pr_closesemaphore`
> - {doc}`pr_deletesemaphore`
