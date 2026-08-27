(mozilla-projects-nss-reference-fc-getfunctionstatus)=

# FC_GetFunctionStatus

## [Name](#name)

:::{container}
FC_GetFunctionStatus - get the status of a function running in parallel
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_GetFunctionStatus(
  CK_SESSION_HANDLE hSession
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.
:::

## [Description](#description)

:::{container}
`FC_GetFunctionStatus` is a legacy function that simply returns `CKR_FUNCTION_NOT_PARALLEL`.
:::

## [Return value](#return_value)

:::{container}
`FC_GetFunctionStatus` always returns `CKR_FUNCTION_NOT_PARALLEL`.
:::

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_GetFunctionStatus](/en-US/NSC_GetFunctionStatus)
:::
