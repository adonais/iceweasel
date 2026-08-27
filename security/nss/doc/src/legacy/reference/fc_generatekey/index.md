(mozilla-projects-nss-reference-fc-generatekey)=

# FC_GenerateKey

## [Name](#name)

:::{container}
FC_GenerateKey - generate a new key
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_GenerateKey(
  CK_SESSION_HANDLE hSession,
  CK_MECHANISM_PTR pMechanism,
  CK_ATTRIBUTE_PTR pTemplate,
  CK_ULONG ulCount,
  CK_OBJECT_HANDLE_PTR phKey
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.

`pMechanism`

: [in] pointer to the mechanism to use.

`pTemplate`

: [in] pointer to the template for the new key.

`ulCount`

: [in] number of attributes in the template.

`phKey`

: [out] pointer to the location to receive the handle of the new key.
:::

## [Description](#description)

:::{container}
`FC_GenerateKey` generates a secret key, creating a new key object. The handle of new key is
returned.

A user must log into the token (to assume the NSS User role) before calling `FC_GenerateKey`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_GenerateKey](/en-US/NSC_GenerateKey)
:::
