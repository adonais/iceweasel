/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* Unlike the functional suite's head.js, this installs no stub: only the MLPA
 * network boundary is mocked, through AIWindowTestUtils.withServer. */

const { AIWindowTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

AIWindowTestUtils.init(this, window);
