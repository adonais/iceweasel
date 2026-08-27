(mozilla-projects-nss-reference-fc-getmechanisminfo)=

# FC_GetMechanismInfo

## [Name](#name)

:::{container}
FC_GetMechanismInfo - get information on a particular mechanism.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_GetMechanismInfo(
  CK_SLOT_ID slotID,
  CK_MECHANISM_TYPE type,
  CK_MECHANISM_INFO_PTR pInfo
);
```

:::

## [Parameters](#parameters)

:::{container}
`FC_GetMechanismInfo` takes three parameters:

`slotID`

: [Input]

`type`

: [Input] .

`pInfo`

: [Output] .
:::

## [Description](#description)

:::{container}
`FC_GetMechanismInfo` obtains information about a particular mechanism possibly supported by a
token.

A user may call `FC_GetMechanismInfo` without logging into the token (to assume the NSS User
role).
:::

## [Return value](#return_value)

:::{container}
`CKR_OK`
:::

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_GetMechanismInfo](/en-US/NSC_GetMechanismInfo)
:::
