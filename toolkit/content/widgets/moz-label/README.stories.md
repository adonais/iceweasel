# MozLabel

`moz-label` is an extension of the built-in `HTMLLabelElement` that provides accesskey styling and formatting as well as some click handling logic, and center-cropping (borrowing from the XUL implementation of label).

```html story
<label is="moz-label" accesskey="c" for="check" style={{ display: "inline-block" }}>
    This is a label with an accesskey:
</label>
<input id="check" type="checkbox" defaultChecked style={{ display: "inline-block" }} />
```

Accesskey underlining is enabled by default on Windows and Linux. It is also enabled in Storybook on Mac for demonstrative purposes, but is usually controlled by the `ui.key.menuAccessKey` preference.

## Center cropping

Center cropping is disabled by default, but when enabled, adjusts the display of a label that has exceeded its maximum width by truncating the center of the string with an ellipsis character.

The implementation is shared with the XUL label equivalent, and has the same limitations - mainly that this is best used for simple Latin character sets, and can break horribly or work unexpectedly with more complex character sets. This capability is best used when displaying things like filenames, where it's important to be able to see both the beginning of the filename, as well as the filename extension at the end.

Labels with non-text child nodes are not supported. This means that accesskey underlining will not work when using center cropping.

Enabling center cropping is done by setting `enable-center-crop=""` on the label. When this occurs, `moz-label` will automatically take any text within the element and set it as its `"value"` attribute, and replace the text content of the element with the center-cropped version. Reads of `textContent` will read the uncropped value, and writes to `textContent` will cause the center cropped value to update.

```html story
<label is="moz-label" enable-center-crop="" style={{ display: "inline-block", maxWidth: "150px" }}>
    This is a long label with center cropping and a maximum width set upon it.
</label>
```
