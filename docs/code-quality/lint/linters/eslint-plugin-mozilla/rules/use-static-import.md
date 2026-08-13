# use-static-import

Requires the use of static imports in system ES module files (`.sys.mjs`)
where possible.

## Examples of incorrect code for this rule

```js
const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
const { XPCOMUtils: foo } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
```

## Examples of correct code for this rule

```js
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { XPCOMUtils as foo } from "resource://gre/modules/XPCOMUtils.sys.mjs";
```
