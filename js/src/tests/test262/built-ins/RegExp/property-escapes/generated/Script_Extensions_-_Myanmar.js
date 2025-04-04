// Copyright 2024 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes for `Script_Extensions=Myanmar`
info: |
  Generated by https://github.com/mathiasbynens/unicode-property-escapes-tests
  Unicode v16.0.0
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
includes: [regExpUtils.js]
---*/

const matchSymbols = buildString({
  loneCodePoints: [
    0x00A92E
  ],
  ranges: [
    [0x001000, 0x00109F],
    [0x00A9E0, 0x00A9FE],
    [0x00AA60, 0x00AA7F],
    [0x0116D0, 0x0116E3]
  ]
});
testPropertyEscapes(
  /^\p{Script_Extensions=Myanmar}+$/u,
  matchSymbols,
  "\\p{Script_Extensions=Myanmar}"
);
testPropertyEscapes(
  /^\p{Script_Extensions=Mymr}+$/u,
  matchSymbols,
  "\\p{Script_Extensions=Mymr}"
);
testPropertyEscapes(
  /^\p{scx=Myanmar}+$/u,
  matchSymbols,
  "\\p{scx=Myanmar}"
);
testPropertyEscapes(
  /^\p{scx=Mymr}+$/u,
  matchSymbols,
  "\\p{scx=Mymr}"
);

const nonMatchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x00DC00, 0x00DFFF],
    [0x000000, 0x000FFF],
    [0x0010A0, 0x00A92D],
    [0x00A92F, 0x00A9DF],
    [0x00A9FF, 0x00AA5F],
    [0x00AA80, 0x00DBFF],
    [0x00E000, 0x0116CF],
    [0x0116E4, 0x10FFFF]
  ]
});
testPropertyEscapes(
  /^\P{Script_Extensions=Myanmar}+$/u,
  nonMatchSymbols,
  "\\P{Script_Extensions=Myanmar}"
);
testPropertyEscapes(
  /^\P{Script_Extensions=Mymr}+$/u,
  nonMatchSymbols,
  "\\P{Script_Extensions=Mymr}"
);
testPropertyEscapes(
  /^\P{scx=Myanmar}+$/u,
  nonMatchSymbols,
  "\\P{scx=Myanmar}"
);
testPropertyEscapes(
  /^\P{scx=Mymr}+$/u,
  nonMatchSymbols,
  "\\P{scx=Mymr}"
);

reportCompare(0, 0);
