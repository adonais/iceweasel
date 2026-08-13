# reject-relative-requires

Rejects calls to require which use relative directories.

## Examples of incorrect code for this rule

```js
require("./relative/path")
require("../parent/folder/path")
loader.lazyRequireGetter(this, "path", "../parent/folder/path", true)
```

## Examples of correct code for this rule

```js
require("devtools/absolute/path")
require("resource://gre/modules/SomeModule.sys.mjs")
loader.lazyRequireGetter(this, "path", "devtools/absolute/path", true)
```
