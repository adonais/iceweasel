(mozilla-projects-nss-reference-fc-signrecoverinit)=

# FC_SignRecoverInit

## [Name](#name)

:::{container}
FC_SignRecoverInit - initialize a sign recover operation.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_SignRecoverInit(
  CK_SESSION_HANDLE hSession,
  CK_MECHANISM_PTR pMechanism,
  CK_OBJECT_HANDLE hKey
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.

`pMechanism`

: [in] mechanism to be used for the signing operation.

`hKey`

: [in] handle of the key to be used.
:::

## [Description](#description)

:::{container}
`FC_SignRecoverInit` initializes a initializes a signature operation where the (digest) data
can be recovered from the signature.

A user must log into the token (to assume the NSS User role) before calling
`FC_SignRecoverInit`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_SignRecoverInit](/en-US/NSC_SignRecoverInit)
:::
