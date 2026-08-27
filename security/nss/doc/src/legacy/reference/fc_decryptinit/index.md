(mozilla-projects-nss-reference-fc-decryptinit)=

# FC_DecryptInit

## [Name](#name)

:::{container}
FC_DecryptInit - initialize a decryption operation.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_DecryptInit(
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

: [in] mechanism to be used for the subsequent decryption operation.

`hKey`

: [in] handle of the key to be used.
:::

## [Description](#description)

:::{container}
`FC_DecryptInit` initializes a decryption operation.

A user must log into the token (to assume the NSS User role) before calling `FC_DecryptInit`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_DecryptInit](/en-US/NSC_DecryptInit)
:::
