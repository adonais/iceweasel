/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Globals of a `NewtabSearchbarTestUtils.spawn` task. The eslint rule that
// declares the sandbox's own globals only fires on a literal
// `SpecialPowers.spawn` call.
/* global NewtabSearchbarContentTestUtils, ContentTaskUtils */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/urlbar/tests/browser/head-common.js",
  this
);

ChromeUtils.defineLazyGetter(this, "NewtabSearchbarTestUtils", () => {
  const { NewtabSearchbarTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/NewtabSearchbarTestUtils.sys.mjs"
  );
  module.init(this, window);
  return module;
});

registerCleanupFunction(() => NewtabSearchbarTestUtils.formHistory.clear());
