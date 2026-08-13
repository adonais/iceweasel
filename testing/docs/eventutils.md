# EventUtils documentation

`EventUtils`' methods are available in all browser mochitests on the `EventUtils`
object.

In mochitest-plain and mochitest-chrome, you can load
`"chrome://mochikit/content/tests/SimpleTest/EventUtils.js"` using a regular
HTML script tag to gain access to this set of utilities. In this case, all the
documented methods here are **not** on a separate object, but available as global
functions.

## Mouse input

```{eval-rst}
.. js:autofunction:: EventUtils.sendMouseEvent
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeMouse
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeMouseAtCenter
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeNativeMouseEvent
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeMouseExpectEvent
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeWheel
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeWheelAtPoint
```

```{eval-rst}
.. js:autofunction:: EventUtils.sendWheelAndPaint
```

```{eval-rst}
.. js:autofunction:: EventUtils.sendWheelAndPaintNoFlush
```

## Keyboard input

```{eval-rst}
.. js:autofunction:: EventUtils.sendKey
```

```{eval-rst}
.. js:autofunction:: EventUtils.sendChar
```

```{eval-rst}
.. js:autofunction:: EventUtils.sendString
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeKey
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeNativeKey
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeKeyExpectEvent
```

## Drag and drop

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeDragOver
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeDrop
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizeDropAfterDragOver
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizePlainDragAndDrop
```

```{eval-rst}
.. js:autofunction:: EventUtils.synthesizePlainDragAndCancel
```

```{eval-rst}
.. js:autofunction:: EventUtils.sendDragEvent
```
