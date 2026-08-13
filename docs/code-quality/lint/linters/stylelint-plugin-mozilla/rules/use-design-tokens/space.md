# space

The `use-design-tokens` rule checks that CSS spacing declarations (e.g. margins,
padding, gaps, inset, etc.) use design token variables instead of hardcoded values.
This ensures consistent spacing across the application and makes it easier to
maintain design system consistency.

This rule applies to the following properties:

- `padding` and all of its longhand properties
- `margin` and all of its longhand properties
- `inset` and all of its longhand properties
- `gap`, `column-gap`, `row-gap`
- Positioning attributes: `left`, `right`, `top`, and `bottom`.

Note that the following properties accept both space and size tokens:

- `inset` and all of its longhand properties
- Positioning attributes: `left`, `right`, `top`, and `bottom`

Use space tokens when these properties represent spacing/positioning offsets, and size tokens
when they represent element dimensions.

## Examples of incorrect code for this rule

```css
.custom-button {
  padding: 0.5rem;
}
```

```css
.card {
  margin-inline: 8px;
}
```

```css
.overlay {
  inset: 1rem;
}
```

```css
.grid {
  gap: 4px 12px;
}
```

## Examples of correct token usage for this rule

```css
.custom-button {
  padding-block: var(--space-small);
}
```

```css
.custom-button {
  padding-inline: var(--space-medium);
}
```

```css
.custom-button {
  column-gap: var(--space-xxsmall);
}
```

```css
.custom-button {
  margin-block-start: var(--space-large);
}
```

```css
/* Local CSS variables that reference valid space tokens are allowed */
:root {
  --custom-space: var(--space-xsmall);
}

.custom-button {
  padding: var(--custom-space);
}
```

```css
.custom-button {
  margin-inline-end: var(--custom-space, --space-xlarge);
}
```

```css
.overlay {
  inset: var(--space-small);
}
```

```css
.positioned-element {
  top: var(--space-large);
  left: var(--space-medium);
}
```

The rule also allows these values to be non-token values:

```css
.inherited-inset {
  inset: inherit;
}
```

```css
.unset-padding {
  padding: unset;
}
```

```css
.initial-row-gap {
  row-gap: initial;
}
```

```css
.auto-margin {
  margin-inline: auto;
}
```

```css
.zero-padding {
  padding: 0;
}
```

## Autofix functionality

This rule can automatically fix some violations by replacing common pixel values with
appropriate space tokens. Examples of autofixable violations:

```css
/* Before */
.a {
  margin: 2px;
}

/* After autofix */
.a {
  margin: var(--space-xxsmall);
}
```

```css
/* Before */
.a {
  padding: 8px 16px;
}

/* After autofix */
.a {
  padding: var(--space-small) var(--space-large);
}
```

```css
/* Before */
.a {
  gap: 24px 32px;
}

/* After autofix */
.a {
  gap: var(--space-xlarge) var(--space-xxlarge);
}
```
