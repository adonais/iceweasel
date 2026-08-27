# no-has-selector (stylelint)

This rule disallows the `:has()` pseudo-class in our CSS.

`:has()` scales linearly with the size of the DOM subtree, and requires
generally more complex invalidation / matching than regular selectors.

## Rule Scope

The rule is enabled everywhere except for the about:welcome / about:newtab
family of styles (`browser/components/aboutwelcome`,
`browser/components/asrouter` and `browser/extensions/newtab`), which uses
`:has()` extensively enough that it is turned off there for the time being.

Since a comment can't be a standalone node in the middle of a selector list,
the rule reports at the start of the rule rather than at each `:has()`, so that
one disable comment always covers the whole rule.

## Examples of incorrect usage for this rule

```css
:root:has(#tabbrowser-tabpanels[splitview] .split-view-panel[column="0"].deck-selected) #sidebar-launcher-splitter { /* ... */ }
```

## Examples of correct usage for this rule

```css
:root[splitview] #sidebar-launcher-splitter { /* ... */ }
```

## Disabling the rule

Generally, don't. If it is needed or the subtree is trivially small or so, do
so with a comment explaining why:

```css
/* The label is trivial */
/* stylelint-disable-next-line stylelint-plugin-mozilla/no-has-selector */
label:has(> input:checked) { /* ... */ }
```

But try to avoid doing so, specially when the size of the DOM subtree and its
mutations is influenced by user input, websites or extensions.
