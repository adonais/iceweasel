(mozilla-projects-nss-reference-fc-generaterandom)=

# FC_GenerateRandom

## [Name](#name)

:::{container}
FC_GenerateRandom - generate a random number.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_GenerateRandom(
  CK_SESSION_HANDLE hSession,
  CK_BYTE_PTR pRandomData,
  CK_ULONG ulRandomLen
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.

`pRandomData`

: [out] pointer to the location to receive the random data.

`ulRandomLen`

: [in] length of the buffer in bytes.
:::

## [Description](#description)

:::{container}
`FC_GenerateRandom` generates random data of the specified length.

A user may call `FC_GenerateRandom` without logging into the token (to assume the NSS User
role).
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_GenerateRandom](/en-US/NSC_GenerateRandom)
:::
