/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Check that custom highlighters can be retrieved by type and that they expose
// the expected API.

const TEST_URL = "data:text/html;charset=utf-8,custom highlighters";

const { TYPES } = ChromeUtils.importESModule(
  "resource://devtools/shared/highlighters.mjs"
);

add_task(async function () {
  const { inspector } = await openInspectorForURL(TEST_URL);

  await manyInstancesOfCustomHighlighters(inspector);
  await showHideMethodsAreAvailable(inspector);
  await unknownHighlighterTypeShouldntBeAccepted(inspector);
});

async function manyInstancesOfCustomHighlighters({ inspectorFront }) {
  const h1 = await inspectorFront.getHighlighterByType(TYPES.BOXMODEL);
  const h2 = await inspectorFront.getHighlighterByType(TYPES.BOXMODEL);
  is(h1, h2, "getHighlighterByType returns previous instance by default");
  const h3 = await inspectorFront.getHighlighterByType(TYPES.BOXMODEL, true);
  const h4 = await inspectorFront.getHighlighterByType(TYPES.BOXMODEL, true);
  Assert.notStrictEqual(
    h3,
    h4,
    "getHighlighterByType returns new instances every time (with forced=true) (1)"
  );

  const h5 = await inspectorFront.getHighlighterByType(TYPES.TRANSFORM, true);
  const h6 = await inspectorFront.getHighlighterByType(TYPES.TRANSFORM, true);
  Assert.notStrictEqual(
    h5,
    h6,
    "getHighlighterByType returns new instances every time (with forced=true) (2)"
  );
  ok(
    h5 !== h1 && h5 !== h3 && h5 != h4,
    "getHighlighterByType returns new instances every time (with forced=true) (3)"
  );
  ok(
    h6 !== h1 && h6 !== h3 && h6 != h4,
    "getHighlighterByType returns new instances every time (with forced=true) (4)"
  );

  await h1.finalize();
  await h3.finalize();
  await h4.finalize();
  await h5.finalize();
  await h6.finalize();
}

async function showHideMethodsAreAvailable({ inspectorFront }) {
  const h1 = await inspectorFront.getHighlighterByType(TYPES.BOXMODEL);
  const h2 = await inspectorFront.getHighlighterByType(TYPES.TRANSFORM);

  ok("show" in h1, "Show method is present on the front API");
  ok("show" in h2, "Show method is present on the front API");
  ok("hide" in h1, "Hide method is present on the front API");
  ok("hide" in h2, "Hide method is present on the front API");

  await h1.finalize();
  await h2.finalize();
}

async function unknownHighlighterTypeShouldntBeAccepted({ inspectorFront }) {
  const h = await inspectorFront.getHighlighterByType("whatever");
  ok(!h, "No highlighter was returned for the invalid type");
}
