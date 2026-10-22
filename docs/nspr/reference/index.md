# NSPR API Reference

```{toctree}
:maxdepth: 2
```

## Introduction to NSPR

- {ref}`nspr-naming-conventions`

- {ref}`nspr-threads`

  - {ref}`thread-scheduling`

    - {ref}`setting-thread-priorities`
    - {ref}`preempting-threads`
    - {ref}`interrupting-threads`

- {ref}`nspr-thread-synchronization`

  - {ref}`locks-and-monitors`
  - {ref}`condition-variables`

- {ref}`nspr-sample-code`

## NSPR Types

- {ref}`calling-convention-types`

- {ref}`algebraic-types`

  - {ref}`c-16-2c-and-32-bit-integer-types`

    - {ref}`signed-integers`
    - {ref}`unsigned-integers`

  - {ref}`nspr-types-64-bit-integer-types`

  - {ref}`floating-point-number-type`

  - {ref}`native-os-integer-types`

- {ref}`miscellaneous-types`

  - {ref}`size-type`
  - {ref}`pointer-difference-types`
  - {ref}`boolean-types`
  - {ref}`status-type-for-return-values`

## Threads

- {ref}`threading-types-and-constants`

- {ref}`threading-functions`

  - {ref}`creating-2c-joining-2c-and-identifying-threads`
  - {ref}`controlling-thread-priorities`
  - {ref}`controlling-per-thread-private-data`
  - {ref}`interrupting-and-yielding`
  - {ref}`setting-global-thread-concurrency`
  - {ref}`getting-a-thread-27s-scope`

## Process Initialization

- {ref}`identity-and-versioning`

  - {ref}`name-and-version-constants`

- {ref}`initialization-and-cleanup`

- {ref}`module-initialization`

## Locks

- {ref}`lock-type`
- {ref}`lock-functions`

## Condition_Variables

- {ref}`condition-variable-type`
- {ref}`condition-variable-functions`

## Monitors

- {ref}`monitor-type`
- {ref}`monitor-functions`

## Cached Monitors

- {ref}`cached-monitors-functions`

## I/O Types

- {ref}`directory-type`
- {ref}`file-descriptor-types`
- {ref}`file-info-types`
- {ref}`network-address-types`
- {ref}`types-used-with-socket-options-functions`
- {ref}`type-used-with-memory-mapped-i-2fo`
- {ref}`offset-interpretation-for-seek-functions`

## I/O Functions

- {ref}`functions-that-operate-on-pathnames`
- {ref}`functions-that-act-on-file-descriptors`
- {ref}`directory-i-2fo-functions`
- {ref}`socket-manipulation-functions`
- {ref}`converting-between-host-and-network-addresses`
- {ref}`memory-mapped-i-2fo-functions`
- {ref}`anonymous-pipe-function`
- {ref}`polling-functions`
- {ref}`manipulating-layers`

## Network Addresses

- {ref}`network-address-types-and-constants`
- {ref}`network-address-functions`

## Atomic Operations

- {doc}`pr_atomicincrement`
- {doc}`pr_atomicdecrement`
- {doc}`pr_atomicset`

## Interval Timing

- {ref}`interval-time-type-and-constants`
- {ref}`interval-functions`

## Date and Time

- {ref}`types-and-constants`
- {ref}`time-parameter-callback-functions`
- [Functions](date_and_time.md#functions)

## Memory_Management Operations

- {ref}`memory-allocation-functions`
- {ref}`memory-allocation-macros`

## String Operations

- {doc}`pl_strlen`
- {doc}`pl_strcpy`
- {doc}`pl_strdup`
- {doc}`pl_strfree`

## Floating Point Number to String Conversion

- {doc}`pr_strtod`
- {doc}`pr_dtoa`
- {doc}`pr_cnvtf`

## Linked Lists

- {ref}`linked-list-types`

  - {doc}`prclist`

- {ref}`linked-list-macros`

  - {doc}`pr_init_clist`
  - {doc}`pr_init_static_clist`
  - {doc}`pr_append_link`
  - {doc}`pr_insert_link`
  - {doc}`pr_next_link`
  - {doc}`pr_prev_link`
  - {doc}`pr_remove_link`
  - {doc}`pr_remove_and_init_link`
  - {doc}`pr_insert_before`
  - {doc}`pr_insert_after`

## Dynamic Library Linking

- {ref}`library-linking-types`

  - {doc}`prlibrary`
  - {doc}`prstaticlinktable`

- {ref}`library-linking-functions`

  - {doc}`pr_setlibrarypath`
  - {doc}`pr_getlibrarypath`
  - {doc}`pr_getlibraryname`
  - {doc}`pr_freelibraryname`
  - {doc}`pr_loadlibrary`
  - {doc}`pr_unloadlibrary`
  - {doc}`pr_findsymbol`
  - {doc}`pr_findsymbolandlibrary`
  - {ref}`finding-symbols-defined-in-the-main-executable-program`

- {ref}`platform-notes`

  - `Dynamic Library Search Path`
  - {ref}`exporting-symbols-from-the-main-executable-program`

## Process Management and Interprocess Communication

- {ref}`process-management-types-and-constants`

  - {doc}`prprocess`
  - {doc}`prprocessattr`

- {ref}`process-management-functions`

  - {ref}`setting-the-attributes-of-a-new-process`
  - {ref}`creating-and-managing-processes`

## Logging

- {ref}`conditional-compilation-and-execution`

- {ref}`log-types-and-variables`

  - `PRLogModuleInfo`
  - {doc}`prlogmodulelevel`
  - {doc}`nspr_log_modules`
  - {doc}`nspr_log_file`

- {ref}`logging-functions-and-macros`

  - {doc}`prlogmoduleinfo`
  - `PR_SetLogFile`
  - `PR_SetLogBuffering`
  - `PR_LogPrint`
  - `PR_LogFlush`
  - `PR_LOG_TEST`
  - `PR_LOG`
  - {doc}`pr_assert`
  - `PR_NOT_REACHED`

- {ref}`use-example`

## Named Shared Memory

- {ref}`shared-memory-protocol`
- {ref}`named-shared-memory-functions`

## Anonymous Shared_Memory

- {ref}`anonymous-memory-protocol`
- {ref}`anonymous-shared-memory-functions`

## IPC Semaphores

- {ref}`ipc-semaphore-functions`

## Random Number Generator

- {ref}`random-number-generator-function`

## Hash Tables

- {ref}`hash-table-types-and-constants`
- {ref}`hash-table-functions`

## NSPR Error Handling

- {ref}`error-type`
- {ref}`error-functions`
- {ref}`error-codes`
