The chapter describes the NSPR API for named shared memory. Shared
memory allows multiple processes to access one or more common shared
memory regions, using it as an interprocess communication channel. The
NSPR shared memory API provides a cross-platform named shared-memory
interface that is modeled on similar constructs in the Unix and Windows
operating systems.

- [Shared Memory Protocol](#shared-memory-protocol)
- [Named Shared Memory Functions](#named-shared-memory-functions)

(shared-memory-protocol)=

# Shared Memory Protocol

(using-named-shared-memory-functions)=

## Using Named Shared Memory Functions

{doc}`pr_opensharedmemory` creates the shared memory segment, if it does
not already exist, or opens a connection with the existing shared memory
segment if it already exists.

{doc}`pr_attachsharedmemory` should be called following
{doc}`pr_opensharedmemory` to map the memory segment to an address in the
application's address space. {doc}`pr_attachsharedmemory` may also be
called to remap a shared memory segment after detaching the same
`PRSharedMemory` object. Be sure to detach it when you're finished.

{doc}`pr_detachsharedmemory` should be called to unmap the shared memory
segment from the application's address space.

{doc}`pr_closesharedmemory` should be called when no further use of the
`PRSharedMemory` object is required within a process. Following a call
to {doc}`pr_closesharedmemory`, the `PRSharedMemory` object is invalid
and cannot be reused.

{doc}`pr_deletesharedmemory` should be called before process termination.
After you call {doc}`pr_deletesharedmemory`, any further use of the shared
memory associated with the name may cause unpredictable results.

## Filenames

The name passed to {doc}`pr_opensharedmemory` should be a valid filename
for a Unix platform. {doc}`pr_opensharedmemory` creates file using the name
passed in. Some platforms may mangle the name before creating the file
and the shared memory. The Unix implementation may use SysV IPC shared
memory, Posix shared memory, or memory mapped files; the filename may be
used to define the namespace. On Windows, the name is significant, but
there is no file associated with the name.

No assumptions about the persistence of data in the named file should be
made. Depending on platform, the shared memory may be mapped onto system
paging space and be discarded at process termination.

All names provided to {doc}`pr_opensharedmemory` should be valid filename
syntax or name syntax for shared memory for the target platform.
Referenced directories should have permissions appropriate for writing.

(limits-on-shared-memory-resources)=

## Limits on Shared Memory Resources

Different platforms have limits on both the number and size of shared
memory resources. The default system limits on some platforms may be
smaller than your requirements. These limits may be adjusted on some
platforms either via boot-time options or by setting the size of the
system paging space to accommodate more and/or larger shared memory
segment(s).

(security-considerations)=

## Security Considerations

On Unix platforms, depending on implementation, contents of the backing
store for the shared memory can be exposed via the file system. Set
permissions and or access controls at create and attach time to ensure
you get the desired security.

On Windows platforms, no special security measures are provided.

(named-shared-memory-functions)=

# Named Shared Memory Functions

> - {doc}`pr_opensharedmemory`
> - {doc}`pr_attachsharedmemory`
> - {doc}`pr_detachsharedmemory`
> - {doc}`pr_closesharedmemory`
> - {doc}`pr_deletesharedmemory`
