(mozilla-projects-nss-reference-fc-signinit)=

# FC_SignInit

## [Name](#name)

:::{container}
FC_SignInit - initialize a signing operation.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_SignInit(
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

: [in] mechanism to be used for the subsequent signing operation.

`hKey`

: [in] handle of the key to be used .
:::

## [Description](#description)

:::{container}
`FC_SignInit` initializes a signature operation.

A user must log into the token (to assume the NSS User role) before calling `FC_SignInit`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_SignInit](/en-US/NSC_SignInit) {ref}`mozilla_projects_nss_reference_fc_sign`
  {ref}`mozilla_projects_nss_reference_fc_signupdate`
  {ref}`mozilla_projects_nss_reference_fc_signfinal`
:::
