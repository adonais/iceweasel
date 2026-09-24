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

- {ref}`PR_AtomicIncrement`
- {ref}`PR_AtomicDecrement`
- {ref}`PR_AtomicSet`

## Interval Timing

- {ref}`interval-time-type-and-constants`
- {ref}`interval-functions`

## Date and Time

- {ref}`types-and-constants`
- {ref}`time-parameter-callback-functions`
- {ref}`Functions`

## Memory_Management Operations

- {ref}`memory-allocation-functions`
- {ref}`memory-allocation-macros`

## String Operations

- {ref}`PL_strlen`
- {ref}`PL_strcpy`
- {ref}`PL_strdup`
- {ref}`PL_strfree`

## Floating Point Number to String Conversion

- {ref}`PR_strtod`
- {ref}`PR_dtoa`
- {ref}`PR_cnvtf`

## Linked Lists

- {ref}`linked-list-types`

  - {ref}`PRCList`

- {ref}`linked-list-macros`

  - {ref}`PR_INIT_CLIST`
  - {ref}`PR_INIT_STATIC_CLIST`
  - {ref}`PR_APPEND_LINK`
  - {ref}`PR_INSERT_LINK`
  - {ref}`PR_NEXT_LINK`
  - {ref}`PR_PREV_LINK`
  - {ref}`PR_REMOVE_LINK`
  - {ref}`PR_REMOVE_AND_INIT_LINK`
  - {ref}`PR_INSERT_BEFORE`
  - {ref}`PR_INSERT_AFTER`

## Dynamic Library Linking

- {ref}`library-linking-types`

  - {ref}`PRLibrary`
  - {ref}`PRStaticLinkTable`

- {ref}`library-linking-functions`

  - {ref}`PR_SetLibraryPath`
  - {ref}`PR_GetLibraryPath`
  - {ref}`PR_GetLibraryName`
  - {ref}`PR_FreeLibraryName`
  - {ref}`PR_LoadLibrary`
  - {ref}`PR_UnloadLibrary`
  - {ref}`PR_FindSymbol`
  - {ref}`PR_FindSymbolAndLibrary`
  - {ref}`finding-symbols-defined-in-the-main-executable-program`

- {ref}`platform-notes`

  - `Dynamic Library Search Path`
  - {ref}`exporting-symbols-from-the-main-executable-program`

## Process Management and Interprocess Communication

- {ref}`process-management-types-and-constants`

  - {ref}`PRProcess`
  - {ref}`PRProcessAttr`

- {ref}`process-management-functions`

  - {ref}`setting-the-attributes-of-a-new-process`
  - {ref}`creating-and-managing-processes`

## Logging

- {ref}`conditional-compilation-and-execution`

- {ref}`log-types-and-variables`

  - `PRLogModuleInfo`
  - {ref}`PRLogModuleLevel`
  - {ref}`NSPR_LOG_MODULES`
  - {ref}`NSPR_LOG_FILE`

- {ref}`logging-functions-and-macros`

  - {ref}`PR_NewLogModule`
  - `PR_SetLogFile`
  - `PR_SetLogBuffering`
  - `PR_LogPrint`
  - `PR_LogFlush`
  - `PR_LOG_TEST`
  - `PR_LOG`
  - {ref}`PR_Assert`
  - {ref}`PR_ASSERT`
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
