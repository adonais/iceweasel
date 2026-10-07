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

> - {ref}`PR_OpenSemaphore`
> - {ref}`PR_WaitSemaphore`
> - {ref}`PR_PostSemaphore`
> - {ref}`PR_CloseSemaphore`
> - {ref}`PR_DeleteSemaphore`
