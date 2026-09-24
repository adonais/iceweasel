# no-background-without-text-color (stylelint)

This rule requires a text color from any declaration block that paints its
background with a design token that has a paired text color token.

A block that paints a background claims a surface, and it owes that surface a
text color. Without one, the text takes whatever color an unrelated ancestor
happens to supply, and nothing guarantees the two have sufficient contrast in
every theme, in dark mode, under `prefers-contrast`, or under `forced-colors` —
high contrast mode, which applies to chrome windows on Windows and to `about:`
pages on every platform.

The counterpart of the background token is the text color the surface was
designed for, so the rule's message names it;
[use-paired-color-tokens](use-paired-color-tokens.md) is what checks a
combination once both halves are declared.

## Rule Scope

The rule reports a block whose winning `background` or `background-color`
declaration reads a background token that has a paired text color token, and
which sets no `color`. A background token without a counterpart is meant to
combine with whatever the surface inherits, so it makes no claim to report.

Blocks selected by a state — `:hover`, `:focus`, `[open]`, `[disabled]` and
their kin — are exempt, along with blocks nested inside one. A state variant
usually restyles an element its base rule has already given a text color, and
that base rule is generally a flat sibling the rule cannot reach. A negated
state such as `:not(:hover)` names the base state itself, so a block selected
that way owes the surface a text color and is reported.

Read that as a gap in the rule, not as permission. Declare both halves in a
state variant too: `--button-text-color-hover` and `--button-text-color` are
separate tokens that can resolve to entirely different values under
`forced-colors`, so a state that repaints the background and inherits the base
rule's text color is not safe there.

Declarations directly inside an at-rule are checked as their own block, since a
`@media` query can paint a background the rule around it does not. The element
is the same one either way, so a `color` on the rule covers what the at-rule
paints:

```css
.card {
  color: var(--panel-text-color);

  @media -moz-pref("browser.nova.enabled") {
    /* Fine: the color above applies to this element in every query. */
    background-color: var(--panel-background-color);
  }
}
```

A nested *rule* matches a different element and stands on its own.

A block can hand the surface a text color through a custom property instead of a
`color` declaration, which is how a component that renders the text in its own
shadow tree takes one. Defining a paired text token, or a property that reads
one, satisfies the rule:

```css
.new-badge {
  background-color: var(--badge-background-color-filled);
  --badge-text-color: var(--badge-text-color-filled);
}
```

The rule does not require the reverse: a block that sets only a text color is
usually a descendant of the element painting the background, which the rule
cannot see.

## Examples of incorrect usage for this rule

```css
#header {
  background-color: var(--sidebar-background-color);
}
```

## Examples of correct usage for this rule

```css
#header {
  background-color: var(--sidebar-background-color);
  color: var(--sidebar-text-color);
}
```

```css
.toolbar-button:hover {
  background-color: var(--button-background-color-hover);
  color: var(--button-text-color-hover);
}
```

## Autofix functionality

`--fix` declares the counterpart of the background token, after the declaration
that paints the surface:

```css
/* Before autofix */
#header {
  background-color: var(--sidebar-background-color);
}

/* After autofix */
#header {
  background-color: var(--sidebar-background-color);
  color: var(--sidebar-text-color);
}
```

The counterpart is fixed by the design system rather than chosen by the author,
and the rule reports only where that counterpart exists, so the declaration to
insert is determined. What the block alone does not say is whether the surface
takes its text color from elsewhere on purpose, where inserting one is a silent
rendering change. A surface like that carries the disable comment described
below, which stylelint honours for fixes as well as reports.

A comment ending the background declaration's line is the one case the rule
reports without fixing, since the insertion would take the comment onto the new
line.

## Disabling the rule

**Prefer declaring the color.** The tempting disable is the one that reasons
about what the block contains — this element holds no text, its icon takes the
color from a `fill` below, a child element colors itself. Those are all easy to
falsify: markup changes, `forced-colors` turns a translucent wash into an opaque
`ButtonFace`, and the next person to put a text node in the element inherits
whatever happens to be there. Declaring the counterpart costs one line and is
usually value-neutral in the default theme.

A `::part()` is not an exception to that. A `::part()` rule in the outer tree
overrides the component's own declaration for that part, so a block repainting a
part's background sets the `color` in the same block:

```css
.section-context-menu.context-menu-open > moz-button::part(button) {
  background-color: var(--button-background-color-ghost-hover);
  color: var(--button-text-color-ghost-hover);
}
```

`moz-select.css` is the in-tree example to follow: its
`panel-item[selected]::part(button)` sets `background-color` and `color` together
on the element `panel-item.css` gives `background-color: transparent` and
`color: inherit`.

Where a component remaps a background token into its own palette, remap the text
counterpart beside it. Pairing the remapped background with the palette's own
text token instead is what
[use-paired-color-tokens](use-paired-color-tokens.md) rejects:

```css
panel-list {
  --button-background-color-hover: var(--smartwindow-panel-item-background-color-hover);
  --button-text-color-hover: var(--panel-list-text-color);
}
```

That leaves the disable worth writing, for a block where declaring the color
would do damage or would not resolve at all:

```css
/* The tracker count below takes the box text color; a color here would recolor
   the shield. */
/* stylelint-disable-next-line stylelint-plugin-mozilla/no-background-without-text-color */
background-color: var(--urlbar-box-background-color);
```

The comment must name what setting a color here would break, or where the color
comes from instead, in terms a reviewer can check. If the surface should have a
text color of its own but the token does not exist, file a bug for the missing
token and reference it from a `TODO`.
