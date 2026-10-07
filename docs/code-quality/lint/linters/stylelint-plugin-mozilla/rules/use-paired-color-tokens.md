# use-paired-color-tokens (stylelint)

This rule requires that the background and text color design tokens styling one
surface are used as the semantic pair they were designed as: a block that paints
its background with a token that has a paired text color token declares that
text color, and a text color declared beside a token background is the
background's counterpart.

Paired tokens share a name apart from the `background-color` / `text-color`
part, so `--button-background-color-primary-hover` pairs with
`--button-text-color-primary-hover`. A pair is guaranteed to have sufficient
contrast in every theme, in dark mode, under `prefers-contrast` and under
`forced-colors` — high contrast mode, which applies to chrome windows on Windows
and to `about:` pages on every platform. Combining one half with an unrelated
token is not, and neither is leaving the text to whatever color an ancestor
happens to supply. Either way the mismatch usually only shows up in the theme
the author did not try.

## Rule Scope

The rule checks the declarations that win the cascade within one declaration
block, and reports two things.

**A background token used without a text color.** A block that paints a
background claims a surface, and it owes that surface a text color. The rule
reports a block whose winning `background` or `background-color` declaration
reads a background token that has a paired text color token, and which sets no
`color`; the message names the counterpart. A background token without a
counterpart is meant to combine with whatever the surface inherits, so it makes
no claim to report.

**A background and text color that are not counterparts.** Where the block sets
both halves, the rule reports:

- Two paired tokens that are not each other's counterpart, whether they come
  from different components (`--sidebar-background-color` with
  `--panel-text-color`) or from different variants of one component
  (`--button-background-color-menu` with `--button-text-color`).
- Two tokens of one component whose variants differ where the counterpart does
  not exist as a token at all, e.g. `--urlbar-box-background-color-focus` with
  `--urlbar-box-text-color-hover`. Use the component's base text color where it
  has one, and otherwise file a bug for the missing token.

Tokens without a counterpart make no pairing claim and are left alone. That
covers most of the global `--background-color-*` and `--text-color-*` tokens,
which are meant to combine freely, a component variant that deliberately has no
text color of its own and so falls back to the family's base one, and any value
that is not a design token. A global token that does have a counterpart is
paired like any other, so `--background-color-list-item-hover` still has to go
with `--text-color-list-item-hover`.

Neither check applies to a block that sets only a text color. That block is
usually a descendant of the element painting the background, which the rule
cannot see.

Declarations directly inside an at-rule are checked as their own block, since a
`@media` query can paint a background the rule around it does not. A nested
*rule* matches a different element and stands on its own.

### Exemptions of the missing-text-color check

Blocks selected by a state — `:hover`, `:focus`, `[open]`, `[disabled]` and
their kin — are exempt from the missing-text-color check, along with blocks
nested inside one. A state variant usually restyles an element its base rule has
already given a text color, and that base rule is generally a flat sibling the
rule cannot reach. A negated state such as `:not(:hover)` names the base state
itself, so a block selected that way owes the surface a text color and is
reported. Pair checking still applies to them.

Read that as a gap in the rule, not as permission. Declare both halves in a
state variant too: `--button-text-color-hover` and `--button-text-color` are
separate tokens that can resolve to entirely different values under
`forced-colors`, so a state that repaints the background and inherits the base
rule's text color is not safe there.

The element an at-rule paints is the one its enclosing rule matches, so for this
check a `color` on that rule covers what the at-rule paints:

```scss
.card {
  color: var(--panel-text-color);

  @media -moz-pref("browser.nova.enabled") {
    /* Fine: the color above applies to this element in every query. */
    background-color: var(--panel-background-color);
  }
}
```

A block can hand the surface a text color through a custom property instead of a
`color` declaration, which is how a component that renders the text in its own
shadow tree takes one. Defining a paired text token, or a property that reads
one, satisfies the check:

```css
.new-badge {
  background-color: var(--badge-background-color-filled);
  --badge-text-color: var(--badge-text-color-filled);
}
```

## Examples of incorrect usage for this rule

```css
#header {
  background-color: var(--sidebar-background-color);
}
```

```css
.menu-item {
  background-color: var(--button-background-color-menu);
  color: var(--button-text-color);
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
.menu-item {
  background-color: var(--button-background-color-menu);
  color: var(--button-text-color-menu);
}
```

```css
.card {
  background-color: var(--panel-background-color);
  color: var(--text-color-deemphasized);
}
```

## Autofix functionality

Where the text color is missing, `--fix` declares the counterpart of the
background token, after the declaration that paints the surface:

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

Where the text color is the wrong half of a pair, `--fix` swaps it for the
background's counterpart:

```css
/* Before autofix */
.menu-item {
  background-color: var(--button-background-color-menu);
  color: var(--button-text-color);
}

/* After autofix */
.menu-item {
  background-color: var(--button-background-color-menu);
  color: var(--button-text-color-menu);
}
```

The counterpart is fixed by the design system rather than chosen by the author,
and the missing-text-color check reports only where that counterpart exists, so
the declaration to insert is determined. What the block alone does not say is whether the surface
takes its text color from elsewhere on purpose, where inserting one is a silent
rendering change. A surface like that carries the disable comment described
below, which stylelint honours for fixes as well as reports.

Two cases are reported without a fix: a violation against a token that does not
exist, since choosing between the component's base text color and a new token is
the author's call, and a background declaration whose line ends in a comment,
since the insertion would take the comment onto the new line.

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
counterpart beside it, rather than pairing the remapped background with the
palette's own text token:

```css
panel-list {
  --button-background-color-hover: var(--smartwindow-panel-item-background-color-hover);
  --button-text-color-hover: var(--panel-list-text-color);
}
```

That leaves the disable worth writing, for a block where declaring the color
would do damage or would not resolve at all, and for a surface that genuinely
needs an unpaired combination:

```css
/* The tracker count below takes the box text color; a color here would recolor
   the shield. */
/* stylelint-disable-next-line stylelint-plugin-mozilla/use-paired-color-tokens */
background-color: var(--urlbar-box-background-color);
```

```css
/* The dropdown sits on the toolbar, not on the panel it belongs to. */
/* stylelint-disable-next-line stylelint-plugin-mozilla/use-paired-color-tokens */
color: var(--toolbar-text-color);
```

The comment must name what setting a color here would break, or where the color
comes from instead, in terms a reviewer can check. If the surface should have a
text color of its own but the token does not exist, or the pair you want does
not exist, file a bug for the missing token and reference it from a `TODO`.
