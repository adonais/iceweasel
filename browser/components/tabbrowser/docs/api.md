# gBrowser API reference

Generated from the JSDoc in
{searchfox}`Tabbrowser.sys.mjs <browser/components/tabbrowser/Tabbrowser.sys.mjs>`,
so it covers the members that carry a doc comment. Much of the class is
documented nowhere but its source, so read that for anything you don't find
here.

The `_`-prefixed members are left out. They are internal to the tabbrowser and
carry the underscore only because something outside the class reaches them:
another class in the same module, or one of the sibling modules that implement
the tab strip. Everything else internal is `#private`.

Members such as `reload`, `goBack`, `currentURI` and `fullZoom` forward to the
selected tab's browser, so they act on whichever tab is selected when they run.
Code holding a particular tab should use the same member on its
`linkedBrowser`.

## Tabbrowser

```{js:autoclass} Tabbrowser
:members:
:exclude-members: Tabbrowser, _findTabToBlurTo, _getTabsToTheEndFrom, _getTabsToTheStartFrom, _printPreviewBrowsers
```
