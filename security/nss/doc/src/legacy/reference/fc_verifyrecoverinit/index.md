(mozilla-projects-nss-reference-fc-verifyrecoverinit)=

# FC_VerifyRecoverInit

## [Name](#name)

:::{container}
FC_VerifyRecoverInit - initialize a verification operation where data is recoverable.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_VerifyRecoverInit(
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

: [in] mechanism to be used for verification.

`hKey`

: [in] handle of the key to be used.
:::

## [Description](#description)

:::{container}
`FC_VerifyRecoverInit` initializes a signature verification operation where the (digest) data
can be recovered from the signature.

A user must log into the token (to assume the NSS User role) before calling
`FC_VerifyRecoverInit`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_VerifyRecoverInit](/en-US/NSC_VerifyRecoverInit)
:::
