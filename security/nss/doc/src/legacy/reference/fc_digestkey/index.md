(mozilla-projects-nss-reference-fc-digestkey)=

# FC_DigestKey

## [Name](#name)

:::{container}
FC_DigestKey - add the digest of a key to a multi-part digest operation.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_DigestKey(
  CK_SESSION_HANDLE hSession,
  CK_OBJECT_HANDLE hKey
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.

`hKey`

: [in] handle of the key to be digested.
:::

## [Description](#description)

:::{container}
`FC_DigestKey` continues a multi-part digest operation by digesting the value of a secret key.
The digest for the entire message is returned by a call to
{ref}`mozilla_projects_nss_reference_fc_digestfinal`.

A user must log into the token (to assume the NSS User role) before calling `FC_DigestKey`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- {ref}`mozilla_projects_nss_reference_fc_digestinit`,
  {ref}`mozilla_projects_nss_reference_fc_digestfinal`, [NSC_DigestKey](/en-US/NSC_DigestKey)
:::
