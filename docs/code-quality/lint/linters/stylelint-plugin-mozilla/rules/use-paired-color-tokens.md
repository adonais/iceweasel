# use-paired-color-tokens (stylelint)

This rule requires that background and text color design tokens styling the
same surface are used as the semantic pair they were designed as.

Paired tokens share a name apart from the `background-color` / `text-color`
part, so `--button-background-color-primary-hover` pairs with
`--button-text-color-primary-hover`. A pair is guaranteed to have sufficient
contrast in every theme, in dark mode and under `prefers-contrast`; combining
one half with an unrelated token is not, and the mismatch usually only shows up
in the theme the author did not try.

## Rule Scope

The rule only reports a declaration block that sets both a background color and
a text color, because a block that sets one of them takes the other from
somewhere the rule cannot see: an ancestor, a sibling rule, or another
pseudo-element. Whether a block that paints a surface owes it a text color at
all is
[no-background-without-text-color](no-background-without-text-color.md)'s
question.

Within such a block it reports two things:

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

## Examples of incorrect usage for this rule

```css
.menu-item {
  background-color: var(--button-background-color-menu);
  color: var(--button-text-color);
}
```

## Examples of correct usage for this rule

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

Where the background color's counterpart exists as a token, `--fix` swaps the
text color for it:

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

The fix rewrites the `color` declaration the rule reported, and only that: it
never adds a declaration. Filling in the missing one where a block paints a
background is
[no-background-without-text-color](no-background-without-text-color.md)'s fix.

A violation the rule can only report against a token that does not exist is
left alone, since choosing between the component's base text color and a new
token is the author's call.

## Disabling the rule

A surface that genuinely needs an unpaired combination can disable the rule for
the declaration, with a comment saying why:

```css
/* The dropdown sits on the toolbar, not on the panel it belongs to. */
/* stylelint-disable-next-line stylelint-plugin-mozilla/use-paired-color-tokens */
color: var(--toolbar-text-color);
```

If the pair you want does not exist, prefer filing a bug for the missing token
over disabling the rule, and reference it from a `TODO`.
