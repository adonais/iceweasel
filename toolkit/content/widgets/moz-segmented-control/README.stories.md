# MozSegmentedControl

`moz-segmented-control` lets users select one option from a few related choices, displayed as connected buttons. Each option is a `moz-segmented-control-item`, which wraps `moz-button`.

```html story
<moz-segmented-control name="view" aria-label="Select a view" value="list">
  <moz-segmented-control-item value="list" label="List"></moz-segmented-control-item>
  <moz-segmented-control-item value="grid" label="Grid"></moz-segmented-control-item>
  <moz-segmented-control-item value="compact" label="Compact"></moz-segmented-control-item>
</moz-segmented-control>
```

## Code

The source for `moz-segmented-control` and `moz-segmented-control-item` can be found under [toolkit/content/widgets/moz-segmented-control/](https://searchfox.org/firefox-main/source/toolkit/content/widgets/moz-segmented-control/). You can find examples of `moz-segmented-control` in use in the Firefox codebase in both the [print dialog](https://searchfox.org/firefox-main/source/toolkit/components/printing/content/print.html) and [about:addons](https://searchfox.org/firefox-main/source/toolkit/mozapps/extensions/content/components/aboutaddons-themes-mode.mjs).

## When to use `moz-segmented-control`

* Use a segmented control when you want users to pick one option from a small set of closely related options, such as a view mode or a sort order.
* Use a segmented control over a radio group when space is limited and the options have short labels or can be represented by icons.
* Use a segmented control to switch between views when it is paired with a `named-deck`.

## When not to use `moz-segmented-control`

* If there are more than a handful of options or the labels are long, use `moz-radio-group` or `moz-select`.
* If it should be possible for the user to select multiple options, use `moz-checkbox`.
* If the options are actions rather than a choice between states, use `moz-button-group`.

## How to use `moz-segmented-control`

### Importing the element

Like other custom elements, `moz-segmented-control` and `moz-segmented-control-item` are usually lazy loaded when first used. See [Using new design system components](https://firefox-source-docs.mozilla.org/browser/components/storybook/docs/README.reusable-widgets.stories.html#using-new-design-system-components) for more information.

### Combining `moz-segmented-control-item` and `moz-segmented-control`

Place each `moz-segmented-control-item` directly inside `moz-segmented-control`. Do not wrap items in layout elements. The group provides positioning and spacing for its items.

If you are using the elements improperly you may see the following console error:

```sh
moz-segmented-control-item should only be used in an element that extends SelectControlBaseElement.
```

### Setting `value` for the group

The `value` property or attribute of `moz-segmented-control` can be used to set the `checked` state of its `moz-segmented-control-item` elements. While it is also possible to set `checked` directly on individual items, in most cases it's clearer to set `value` on the group. This allows `moz-segmented-control` to serve as the single source of truth for the selected state of its items.

```html
<moz-segmented-control name="greeting" aria-label="Select a preferred greeting" value="hola">
  <moz-segmented-control-item value="hi" label="Hi"></moz-segmented-control-item>
  <moz-segmented-control-item value="hello" label="Hello"></moz-segmented-control-item>
  <moz-segmented-control-item value="hola" label="Hola"></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="greeting" aria-label="Select a preferred greeting" value="hola">
  <moz-segmented-control-item value="hi" label="Hi"></moz-segmented-control-item>
  <moz-segmented-control-item value="hello" label="Hello"></moz-segmented-control-item>
  <moz-segmented-control-item value="hola" label="Hola"></moz-segmented-control-item>
</moz-segmented-control>
```

### Handling selection changes

When the user selects a different item, that item emits `input` and `change` events. Both events bubble to the group, so they can be handled there:

```js
document.querySelector("moz-segmented-control").addEventListener("change", e => {
  console.log(e.target.value);
});
```

### Setting `name` for the group

Set `name` on the containing `moz-segmented-control` to associate its items. The group copies the name to each `moz-segmented-control-item`.

### Setting an accessible name for the group

`moz-segmented-control` is not designed to render a visible label. Use `aria-label` to give the group an accessible name, and rely on the surrounding UI, such as a heading or a `moz-fieldset`, when a visible label is needed:

```html
<moz-segmented-control name="theme" aria-label="Color theme" value="light">
  <moz-segmented-control-item value="light" label="Light"></moz-segmented-control-item>
  <moz-segmented-control-item value="dark" label="Dark"></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="theme" aria-label="Color theme" value="light">
  <moz-segmented-control-item value="light" label="Light"></moz-segmented-control-item>
  <moz-segmented-control-item value="dark" label="Dark"></moz-segmented-control-item>
</moz-segmented-control>
```

### Setting icons on items

Use the `iconSrc` property or `iconsrc` attribute to show an icon before the item's label:

```html
<moz-segmented-control name="orientation" aria-label="Orientation" value="portrait">
  <moz-segmented-control-item value="portrait" label="Portrait" iconsrc="chrome://global/skin/icons/page-portrait.svg"></moz-segmented-control-item>
  <moz-segmented-control-item value="landscape" label="Landscape" iconsrc="chrome://global/skin/icons/page-landscape.svg"></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="orientation" aria-label="Orientation" value="portrait">
  <moz-segmented-control-item value="portrait" label="Portrait" iconsrc="chrome://global/skin/icons/page-portrait.svg"></moz-segmented-control-item>
  <moz-segmented-control-item value="landscape" label="Landscape" iconsrc="chrome://global/skin/icons/page-landscape.svg"></moz-segmented-control-item>
</moz-segmented-control>
```

Items can also be icon-only. In that case, omit the `label` and set `aria-label` so the item still has an accessible name:

```html
<moz-segmented-control name="view" aria-label="View" value="list">
  <moz-segmented-control-item value="list" aria-label="List view" iconsrc="chrome://global/skin/icons/highlights.svg"></moz-segmented-control-item>
  <moz-segmented-control-item value="grid" aria-label="Grid view" iconsrc="chrome://global/skin/icons/defaultFavicon.svg"></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="view" aria-label="View" value="list">
  <moz-segmented-control-item value="list" aria-label="List view" iconsrc="chrome://global/skin/icons/highlights.svg"></moz-segmented-control-item>
  <moz-segmented-control-item value="grid" aria-label="Grid view" iconsrc="chrome://global/skin/icons/defaultFavicon.svg"></moz-segmented-control-item>
</moz-segmented-control>
```

### Setting the `size`

`moz-segmented-control-item` supports the same `size` values as `moz-button`. Set `size="small"` on each item for a more compact control:

```html
<moz-segmented-control name="size" aria-label="Small items" value="one">
  <moz-segmented-control-item value="one" label="One" size="small"></moz-segmented-control-item>
  <moz-segmented-control-item value="two" label="Two" size="small"></moz-segmented-control-item>
  <moz-segmented-control-item value="three" label="Three" size="small"></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="size" aria-label="Small items" value="one">
  <moz-segmented-control-item value="one" label="One" size="small"></moz-segmented-control-item>
  <moz-segmented-control-item value="two" label="Two" size="small"></moz-segmented-control-item>
  <moz-segmented-control-item value="three" label="Three" size="small"></moz-segmented-control-item>
</moz-segmented-control>
```

### Setting the `disabled` state

The `disabled` state can be set on `moz-segmented-control` to disable all of its child items:

```html
<moz-segmented-control name="group-disabled" aria-label="Disabled group" value="one" disabled>
  <moz-segmented-control-item value="one" label="I'm disabled"></moz-segmented-control-item>
  <moz-segmented-control-item value="two" label="I'm disabled too"></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="group-disabled" aria-label="Disabled group" value="one" disabled>
  <moz-segmented-control-item value="one" label="I'm disabled"></moz-segmented-control-item>
  <moz-segmented-control-item value="two" label="I'm disabled too"></moz-segmented-control-item>
</moz-segmented-control>
```

`disabled` can also be set on individual `moz-segmented-control-item` elements to control their state independently of the rest of the group:

```html
<moz-segmented-control name="item-disabled" aria-label="Disabled item" value="enabled">
  <moz-segmented-control-item value="enabled" label="I'm enabled"></moz-segmented-control-item>
  <moz-segmented-control-item value="disabled" label="I'm disabled" disabled></moz-segmented-control-item>
</moz-segmented-control>
```

```html story
<moz-segmented-control name="item-disabled" aria-label="Disabled item" value="enabled">
  <moz-segmented-control-item value="enabled" label="I'm enabled"></moz-segmented-control-item>
  <moz-segmented-control-item value="disabled" label="I'm disabled" disabled></moz-segmented-control-item>
</moz-segmented-control>
```

The one caveat to this is that it is not possible to programmatically enable an individual item when the containing group is `disabled`.

### Switching views with `named-deck`

Set the `deck` attribute to the `id` of a `named-deck` element to use `moz-segmented-control` as a tab switcher. Selecting an item shows the deck view whose `name` matches the item's `value`, and changing the deck's selected view updates the control. When `deck` is set, the control is exposed to assistive technologies as a tablist rather than a radio group.

```html
<moz-segmented-control name="pets" aria-label="Pets" deck="pet-deck" value="dogs">
  <moz-segmented-control-item value="dogs" label="Dogs"></moz-segmented-control-item>
  <moz-segmented-control-item value="cats" label="Cats"></moz-segmented-control-item>
</moz-segmented-control>
<named-deck id="pet-deck" selected-view="dogs">
  <section name="dogs">Dogs are great.</section>
  <section name="cats">Cats are great too.</section>
</named-deck>
```

```html story
<div>
  <moz-segmented-control name="pets" aria-label="Pets" deck="pet-deck" value="dogs">
    <moz-segmented-control-item value="dogs" label="Dogs"></moz-segmented-control-item>
    <moz-segmented-control-item value="cats" label="Cats"></moz-segmented-control-item>
  </moz-segmented-control>
  <named-deck id="pet-deck" selected-view="dogs">
    <section name="dogs">Dogs are great.</section>
    <section name="cats">Cats are great too.</section>
  </named-deck>
</div>
```

### Fluent usage

The `aria-label` property of `moz-segmented-control` and the `label` and `aria-label` properties of `moz-segmented-control-item` will generally be provided via [Fluent attributes](https://mozilla-l10n.github.io/localizer-documentation/tools/fluent/basic_syntax.html#attributes). `data-l10n-attrs` are set automatically, so to get things working you just need to supply a `data-l10n-id` as you would with any other element.

For example the following Fluent messages:

```
moz-segmented-control-id =
  .aria-label = This is the accessible name for the group
first-item-id =
  .label = This is the label for the first item
second-item-id =
  .aria-label = This is the accessible name for an icon-only item
```

Would be used to set labels on the different elements as follows:

```html
<moz-segmented-control data-l10n-id="moz-segmented-control-id" value="first">
  <moz-segmented-control-item value="first" data-l10n-id="first-item-id"></moz-segmented-control-item>
  <moz-segmented-control-item value="second" data-l10n-id="second-item-id" iconsrc="chrome://global/skin/icons/highlights.svg"></moz-segmented-control-item>
</moz-segmented-control>
```
