// Copyright 2024 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes for `Script=Nabataean`
info: |
  Generated by https://github.com/mathiasbynens/unicode-property-escapes-tests
  Unicode v16.0.0
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
includes: [regExpUtils.js]
---*/

const matchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x010880, 0x01089E],
    [0x0108A7, 0x0108AF]
  ]
});
testPropertyEscapes(
  /^\p{Script=Nabataean}+$/u,
  matchSymbols,
  "\\p{Script=Nabataean}"
);
testPropertyEscapes(
  /^\p{Script=Nbat}+$/u,
  matchSymbols,
  "\\p{Script=Nbat}"
);
testPropertyEscapes(
  /^\p{sc=Nabataean}+$/u,
  matchSymbols,
  "\\p{sc=Nabataean}"
);
testPropertyEscapes(
  /^\p{sc=Nbat}+$/u,
  matchSymbols,
  "\\p{sc=Nbat}"
);

const nonMatchSymbols = buildString({
  loneCodePoints: [],
  ranges: [
    [0x00DC00, 0x00DFFF],
    [0x000000, 0x00DBFF],
    [0x00E000, 0x01087F],
    [0x01089F, 0x0108A6],
    [0x0108B0, 0x10FFFF]
  ]
});
testPropertyEscapes(
  /^\P{Script=Nabataean}+$/u,
  nonMatchSymbols,
  "\\P{Script=Nabataean}"
);
testPropertyEscapes(
  /^\P{Script=Nbat}+$/u,
  nonMatchSymbols,
  "\\P{Script=Nbat}"
);
testPropertyEscapes(
  /^\P{sc=Nabataean}+$/u,
  nonMatchSymbols,
  "\\P{sc=Nabataean}"
);
testPropertyEscapes(
  /^\P{sc=Nbat}+$/u,
  nonMatchSymbols,
  "\\P{sc=Nbat}"
);

reportCompare(0, 0);
