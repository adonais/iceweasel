# Process Initialization

This chapter describes the NSPR API for versioning, process
initialization, and shutdown of NSPR.

- [Identity and Versioning](#identity-and-versioning)
- [Initialization and Cleanup](#initialization-and-cleanup)
- [Module Initialization](#module-initialization)

(identity-and-versioning)=

## Identity and Versioning

(name-and-version-constants)=

### Name and Version Constants

> - {doc}`pr_name`
> - {doc}`pr_version`
> - {doc}`pr_versioncheck`

(initialization-and-cleanup)=

## Initialization and Cleanup

NSPR detects whether the library has been initialized and performs
implicit initialization if it hasn't. Implicit initialization should
suffice unless a program has specific sequencing requirements or needs
to characterize the primordial thread. Explicit initialization is rarely
necessary.

Implicit initialization assumes that the initiator is the primordial
thread and that the thread is a user thread of normal priority.

> - {doc}`pr_init`
> - {doc}`pr_initialize`
> - {doc}`pr_initialized`
> - {doc}`pr_cleanup`
> - {doc}`pr_disableclockinterrupts`
> - {doc}`pr_blockclockinterrupts`
> - {doc}`pr_unblockclockinterrupts`
> - {doc}`pr_setconcurrency`
> - {doc}`pr_processexit`
> - {doc}`pr_abort`

(module-initialization)=

### Module Initialization

Initialization can be tricky in a threaded environment, especially
initialization that must happen exactly once. {doc}`pr_callonce` ensures
that such initialization code is called only once. This facility is
recommended in situations where complicated global initialization is
required.

> - {doc}`prcalloncetype`
> - {doc}`prcalloncefn`
> - {doc}`pr_callonce`
