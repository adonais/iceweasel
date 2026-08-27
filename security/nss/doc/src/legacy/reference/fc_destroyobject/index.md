(mozilla-projects-nss-reference-fc-destroyobject)=

# FC_DestroyObject

## [Name](#name)

:::{container}
FC_DestroyObject - destroy an object.
:::

## [Syntax](#syntax)

:::{container}

```{code}
CK_RV FC_DestroyObject(
  CK_SESSION_HANDLE hSession,
  CK_OBJECT_HANDLE hObject
);
```

:::

## [Parameters](#parameters)

:::{container}
`hSession`

: [in] session handle.

`hObject`

: [in] object handle.
:::

## [Description](#description)

:::{container}
`FC_DestroyObject` destroys an object.

A user must log into the token (to assume the NSS User role) before destroying a secret or
private key object.
:::

## [Return value](#return_value)

## [Examples](#examples)

## [See also](#see_also)

:::{container}

- [NSC_DestroyObject](/en-US/NSC_DestroyObject)
:::
