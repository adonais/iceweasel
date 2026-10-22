NSPR provides an execution environment that promotes the use of
lightweight threads. Each thread is an execution entity that is
scheduled independently from other threads in the same process. This
chapter describes the basic NSPR threading API.

- [Threading Types and Constants](#threading-types-and-constants)
- [Threading Functions](#threading-functions)

A thread has a limited number of resources that it truly owns. These
resources include a stack and the CPU registers (including PC). To an
NSPR client, a thread is represented by a pointer to an opaque structure
of type {doc}`prthread`. A thread is created by an explicit client request
and remains a valid, independent execution entity until it returns from
its root function or the process abnormally terminates. Threads are
critical resources and therefore require some management. To synchronize
the termination of a thread, you can **join** it with another thread
(see {doc}`pr_jointhread`). Joining a thread provides definitive proof that
the target thread has terminated and has finished with both the
resources to which the thread has access and the resources of the thread
itself.

For an overview of the NSPR threading model and sample code that
illustrates its use, see [Introduction to
NSPR](introduction_to_nspr.md).

For API reference information related to thread synchronization, see
[Locks](locks.md) and [Condition Variables](condition_variables.md).

(threading-types-and-constants)=

# Threading Types and Constants

> - {doc}`prthread`
> - {doc}`prthreadtype`
> - {doc}`prthreadscope`
> - {doc}`prthreadstate`
> - {doc}`prthreadpriority`
> - {doc}`prthreadprivatedtor`

(threading-functions)=

# Threading Functions

Most of the functions described here accept a pointer to the thread as
an argument. NSPR does not check for the validity of the thread. It is
the caller's responsibility to ensure that the thread is valid. The
effects of these functions on invalid threads are undefined.

- [Creating, Joining, and Identifying
  Threads](#creating-joining-and-identifying-threads)
- [Controlling Thread Priorities](#controlling-thread-priorities)
- [Interrupting and Yielding](#interrupting-and-yielding)
- [Setting Global Thread
  Concurrency](#setting-global-thread-concurrency)
- [Getting a Thread's Scope](#getting-a-threads-scope)

(creating-2c-joining-2c-and-identifying-threads)=

## Creating, Joining, and Identifying Threads

> - {doc}`pr_createthread` creates a new thread.
> - {doc}`pr_jointhread` blocks the calling thread until a specified thread
>   terminates.
> - {doc}`pr_getcurrentthread` returns the current thread object for the
>   currently running code.
> - `PR_AttachThread` associates a {doc}`prthread` object with an existing
>   native thread.
> - `PR_DetachThread` disassociates a {doc}`prthread` object from a native
>   thread.

(controlling-thread-priorities)=

## Controlling Thread Priorities

For an overview of the way NSPR controls thread priorities, see [Setting
Thread Priorities](introduction_to_nspr.md#setting-thread-priorities).

You set a thread's NSPR priority when you create it with
{doc}`pr_createthread`. After a thread has been created, you can get and
set its priority with these functions:

> - {doc}`pr_getthreadpriority`
> - {doc}`pr_setthreadpriority`

(controlling-per-thread-private-data)=

## Controlling Per-Thread Private Data

You can use these functions to associate private data with each of the
threads in a process:

> - {doc}`pr_newthreadprivateindex` allocates a unique index. If the call is
>   successful, every thread in the same process is capable of
>   associating private data with the new index.
> - {doc}`pr_setthreadprivate` associates private thread data with an index.
> - {doc}`pr_getthreadprivate` retrieves data associated with an index.

(interrupting-and-yielding)=

## Interrupting and Yielding

> - {doc}`pr_interrupt` requests an interrupt of another thread. Once the
>   target thread has been notified of the request, the request stays
>   with the thread until the notification either has been delivered
>   exactly once or is cleared.
> - {doc}`pr_clearinterrupt` clears a previous interrupt request.
> - {doc}`pr_sleep` causes a thread to yield to other threads for a
>   specified number of ticks.

(setting-global-thread-concurrency)=

## Setting Global Thread Concurrency

> - {doc}`pr_setconcurrency` sets the number of global threads used by NSPR
>   to create local threads.

(getting-a-thread-27s-scope)=

## Getting a Thread's Scope

> - {doc}`pr_getthreadscope` gets the scoping of the current thread.
