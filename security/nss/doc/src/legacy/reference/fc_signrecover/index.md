(mozilla-projects-nss-reference-fc-signrecover)=

# FC_SignRecover

## [Name](#name)

:::{container}
FC_SignRecover - Sign data in a single recoverable operation.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_SignRecover(
  CK_SESSION_HANDLE hSession,
  CK_BYTE_PTR pData,
  CK_ULONG usDataLen,
  CK_BYTE_PTR pSignature,
  CK_ULONG_PTR pusSignatureLen
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.

`pData`

: [in] mechanism to be used for the signing operation.

`usDataLen`

: [in] handle of the key to be usedn.

`pSignature`

: [out] pointer to the buffer or NULL.

`pusSignatureLen`

: [in, out] pointer to the size of the output buffer, replaced by the length of the signature if
  the operation is successful.
:::

## [Description](#description)

:::{container}
`FC_SignRecover` signs data in a single operation where the (digest) data can be recovered from
the signature. If `pSignature` is NULL only the length of the signature is returned in
`*pusSignatureLen`.

A user must log into the token (to assume the NSS User role) before calling `FC_SignRecover`.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_SignRecover](/en-US/NSC_SignRecover)
:::
