(mozilla-projects-nss-reference-fc-getmechanismlist)=

# FC_GetMechanismList

## [Name](#name)

:::{container}
FC_GetMechanismList - get a list of mechanism types supported by a token.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_GetMechanismList(
  CK_SLOT_ID slotID,
  CK_MECHANISM_TYPE_PTR pMechanismList,
  CK_ULONG_PTR pusCount
);
```

:::

## [Parameters](#parameters)

:::{container}
`FC_GetMechanismList` takes three parameters:

`slotID`

: [Input]

`pInfo`

: [Output] The address of a variable that will receive a pointer to the list of function
  pointers.
:::

## [Description](#description)

:::{container}
`FC_GetMechanismList` obtains a list of mechanism types supported by a token.

A user may call `FC_GetMechanismList` without logging into the token (to assume the NSS User
role).
:::

## [Return value](#return_value)

:::{container}
`CKR_OK`
:::

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_GetMechanismList](/en-US/NSC_GetMechanismList)
:::
