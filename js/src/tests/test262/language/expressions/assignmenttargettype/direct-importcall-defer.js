// |reftest| shell-option(--enable-defer-import-eval) skip-if(release_or_beta||!xulRuntime.shell) error:SyntaxError module -- import-defer is not released yet, requires shell-options
// This file was procedurally generated from the following sources:
// - src/assignment-target-type/importcall-defer.case
// - src/assignment-target-type/invalid/direct.template
/*---
description: Static Semantics AssignmentTargetType, Return invalid. (Direct assignment)
features: [import-defer]
flags: [generated, module]
negative:
  phase: parse
  type: SyntaxError
info: |
    Direct assignment

    ImportCall
    Static Semantics AssignmentTargetType, Return invalid.

---*/

$DONOTEVALUATE();

import.defer() = 1;
