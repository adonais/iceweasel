This chapter describes the most common NSPR types. Other chapters
describe more specialized types when describing the functions that use
them.

- [Calling Convention Types](#calling-convention-types) are used for
  externally visible functions and globals.
- [Algebraic Types](#algebraic-types) of various lengths are used
  for integer algebra.
- [Miscellaneous Types](#miscellaneous-types) are used for
  representing size, pointer difference, Boolean values, and return
  values.

For information on naming conventions for NSPR types, functions, and
macros, see [NSPR Naming
Conventions](introduction_to_nspr.md#nspr-naming-conventions).

(calling-convention-types)=

# Calling Convention Types

These types are used to support cross-platform declarations of
prototypes and implementations:

> - {doc}`pr_extern` is used for declarations of external functions or
>   variables.
> - {doc}`pr_implement` is used for definitions of external functions or
>   variables.
> - `PR_CALLBACK` is used for definitions and declarations of functions
>   that are called via function pointers. A typical example is a
>   function implemented in an application but called from a shared
>   library.

Here are some simple examples of the use of these types:

:::{container} highlight
In dowhim.h:

```{code}
PR_EXTERN( void ) DoWhatIMean( void );

static void PR_CALLBACK RootFunction(void *arg);
```

:::

:::{container} highlight
In dowhim.c:

```{code}
PR_IMPLEMENT( void ) DoWhatIMean( void ) { return; };

PRThread *thread = PR_CreateThread(..., RootFunction, ...);
```

:::

(algebraic-types)=

# Algebraic Types

NSPR provides the following type definitions with unambiguous bit widths
for algebraic operations:

- [8-, 16-, and 32-bit Integer
  Types](#8--16--and-32-bit-integer-types)
- [64-bit Integer Types](#nspr-types-64-bit-integer-types)
- [Floating-Point Number Type](#floating-point-number-type)

For convenience, NSPR also provides type definitions with
platform-dependent bit widths:

- [Native OS Integer Types](#native-os-integer-types)

(c-16-2c-and-32-bit-integer-types)=

## 8-, 16-, and 32-bit Integer Types

(signed-integers)=

### Signed Integers

> - {doc}`print8`
> - {doc}`print16`
> - {doc}`print32`

(unsigned-integers)=

### Unsigned Integers

> - {doc}`pruint8`
> - {doc}`pruint16`
> - {doc}`pruint32`

(nspr-types-64-bit-integer-types)=

## 64-bit Integer Types

Different platforms treat 64-bit numeric fields in different ways. Some
systems require emulation of 64-bit fields by using two 32-bit numeric
fields bound in a structure. Since the types (`long long` versus
`struct LONGLONG`) are not type compatible, NSPR defines macros to
manipulate 64-bit numeric fields. These macros are defined in
`prlong.h`. Conscientious use of these macros ensures portability of
code to all the platforms supported by NSPR and still provides optimal
behavior on those systems that treat long long values directly.

> - {doc}`print64`
> - {doc}`pruint64`

(floating-point-number-type)=

## Floating-Point Number Type

The NSPR floating-point type is always 64 bits.

> - {doc}`prfloat64`

(native-os-integer-types)=

## Native OS Integer Types

These types are most appropriate for automatic variables. They are
guaranteed to be at least 16 bits, though various architectures may
define them to be wider (for example, 32 or even 64 bits). These types
are never valid for fields of a structure.

> - {doc}`printn`
> - {doc}`pruintn`

(miscellaneous-types)=

# Miscellaneous Types

- [Size Type](#size-type)
- [Pointer Difference Types](#pointer-difference-types)
- [Boolean Types](#boolean-types)
- [Status Type for Return Values](#status-type-for-return-values)

(size-type)=

## Size Type

> - {doc}`prsize`

(pointer-difference-types)=

## Pointer Difference Types

Types for pointer difference. Variables of these types are suitable for
storing a pointer or pointer subtraction. These are the same as the
corresponding types in `libc`.

> - {doc}`prptrdiff`
> - {doc}`pruptrdiff`

(boolean-types)=

## Boolean Types

Type and constants for Boolean values.

> - {doc}`prbool`
> - {doc}`prpackedbool`

(status-type-for-return-values)=

## Status Type for Return Values

> - {doc}`prstatus`
