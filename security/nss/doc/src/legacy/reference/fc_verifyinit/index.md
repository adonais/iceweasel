(mozilla-projects-nss-reference-fc-verifyinit)=

# FC_VerifyInit

## [Name](#name)

:::{container}
FC_VerifyInit - initialize a verification operation.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_VerifyInit(
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

: [in] mechanism to be used for the verification operation.

`hKey`

: [in] handle of the key to be used.
:::

## [Description](#description)

:::{container}
`FC_VerifyInit` initializes a verification operation where the signature is an appendix to the
data.

A user must log into the token (to assume the NSS User role) before calling `FC_VerifyInit`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_VerifyInit](/en-US/NSC_VerifyInit)
:::
