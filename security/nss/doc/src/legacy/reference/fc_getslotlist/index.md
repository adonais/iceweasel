(mozilla-projects-nss-reference-fc-getslotlist)=

# FC_GetSlotList

## [Name](#name)

:::{container}
FC_GetSlotList - Obtain a list of slots in the system.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_GetSlotList(
  CK_BBOOL tokenPresent,
  CK_SLOT_ID_PTR pSlotList,
  CK_ULONG_PTR pulCount
);
```

:::

## [Parameters](#parameters)

:::{container}
`tokenPresent`

: [in] If true only slots with a token present are included in the list, otherwise all slots are
  included.

`pSlotList`

: [out] Either null or a pointer to an existing array of `CK_SLOT_ID` objects.

`pulCount`

: [out] Pointer to a `CK_ULONG` variable which receives the slot count.;
:::

## [Description](#description)

:::{container}
`FC_GetSlotList` obtains a list of slots in the system.

A user may call `FC_GetSlotList` without logging into the token (to assume the NSS User role).
:::

## [Return value](#return_value)

:::{container}
`CKR_OK`
:::

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_GetSlotList](/en-US/NSC_GetSlotList)
:::
