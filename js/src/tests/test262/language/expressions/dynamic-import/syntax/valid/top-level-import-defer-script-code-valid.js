// |reftest| shell-option(--enable-defer-import-eval) skip-if(release_or_beta||!xulRuntime.shell) -- import-defer is not released yet, requires shell-options
// This file was procedurally generated from the following sources:
// - src/dynamic-import/import-defer-script-code-valid.case
// - src/dynamic-import/syntax/valid/top-level.template
/*---
description: import.defer() can be used in script code (top level syntax)
esid: sec-import-call-runtime-semantics-evaluation
features: [import-defer, dynamic-import]
flags: [generated]
info: |
    ImportCall :
        import( AssignmentExpression )

---*/

import.defer('./empty_FIXTURE.js');

reportCompare(0, 0);
