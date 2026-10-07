// |reftest| shell-option(--enable-defer-import-eval) skip-if(release_or_beta||!xulRuntime.shell) module -- import-defer is not released yet, requires shell-options
// Copyright (C) 2024 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-imports
description: >
  `defer` is a valid name for default imports
info: |
  ImportDeclaration :
    `import` ImportClause FromClause `;`
    `import` `defer` NameSpaceImport FromClause `;`
    `import` ModuleSpecifier `;`

  ImportClause :
    ImportedDefaultBinding
    ...

  ImportedDefaultBinding :
    ImportedBinding

  ImportedBinding :
    BindingIdentifier[~Yield, +Await]

flags: [module]
features: [import-defer]
---*/

import defer from "./dep_FIXTURE.js";

assert.sameValue(defer, 1, "`defer` is the default export binding");

reportCompare(0, 0);
