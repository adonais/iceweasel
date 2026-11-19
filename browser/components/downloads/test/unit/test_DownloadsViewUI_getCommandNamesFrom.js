/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  DownloadsViewUI:
    "moz-src:///browser/components/downloads/DownloadsViewUI.sys.mjs",
});

class IntermediateDownloadElementShell
  extends DownloadsViewUI.DownloadElementShell
{
  // eslint-disable-next-line no-unused-private-class-members
  #notACommandMember = null;
  notACommandMethodInIntermidate() {}
  // eslint-disable-next-line no-unused-private-class-members
  #alsoNotACommandMethodInIntermidate() {}

  cmd_testFromIntermediate() {}
  downloadsCmd_testFromIntermediate() {}

  cmd_overriddenTest() {}
  downloadsCmd_overriddenTest() {}
}

class FinalDownloadElementShell extends IntermediateDownloadElementShell {
  // eslint-disable-next-line no-unused-private-class-members
  #notACommandMember2 = null;
  notACommandMethodInFinal() {}
  // eslint-disable-next-line no-unused-private-class-members
  #alsoNotACommandMethodInFinal() {}

  cmd_testFromFinal() {}
  downloadsCmd_testFromFinal() {}

  cmd_overriddenTest() {}
  downloadsCmd_overriddenTest() {}
}

/**
 * Ensures that two sets are in fact equal in size and contents.
 *
 * @param {Set} setA
 * @param {Set} setB
 */
function assertSetsEqual(setA, setB) {
  // Strangely, there's nothing on Set that allows for one-shot equivalence
  // checking. We instead assert equivalence by ensuring that the two sets are
  // the same size, and after unioning, still have that same size.
  Assert.equal(setA.size, setB.size, "Sets are the same size as expected.");
  Assert.equal(
    setA.size,
    setA.union(setB).size,
    "Sets after union are the same size as expected."
  );
}

/**
 * Tests that DownloadsViewUI.getCommandNamesFrom properly walks the prototype
 * chain and extracts only command names and nothing else from classes.
 */
add_task(async function test_getCommandNamesFrom_classes() {
  const result = new Set(
    DownloadsViewUI.getCommandNamesFrom(FinalDownloadElementShell)
  );
  const expected = new Set([
    // From DownloadsViewUI.DownloadElementShell
    "downloadsCmd_cancel",
    "downloadsCmd_confirmBlock",
    "downloadsCmd_cancel",
    "downloadsCmd_confirmBlock",
    "downloadsCmd_open",
    "downloadsCmd_openReferrer",
    "downloadsCmd_pauseResume",
    "downloadsCmd_show",
    "downloadsCmd_retry",
    "downloadsCmd_delete",
    "cmd_delete",
    "downloadsCmd_deleteFile",
    "downloadsCmd_openInSystemViewer",
    "downloadsCmd_alwaysOpenInSystemViewer",
    "downloadsCmd_alwaysOpenSimilarFiles",

    // From IntermediateDownloadElementShell
    "cmd_testFromIntermediate",
    "downloadsCmd_testFromIntermediate",

    // From FinalDownloadElementShell
    "cmd_testFromFinal",
    "downloadsCmd_testFromFinal",
    "cmd_overriddenTest",
    "downloadsCmd_overriddenTest",
  ]);

  assertSetsEqual(result, expected);
});

const SimpleObject = {
  doNotInclude: () => {},
  cmd_someMethod: () => {},
  downloadsCmd_someOtherMethod: () => {},
};

/**
 * Tests that DownloadsViewUI.getCommandNamesFrom properly walks the prototype
 * chain of vanilla objects and extracts the command names.
 */
add_task(async function test_getCommandNamesFrom_classes() {
  const result = new Set(DownloadsViewUI.getCommandNamesFrom(SimpleObject));
  const expected = new Set([
    // From SimpleObject
    "cmd_someMethod",
    "downloadsCmd_someOtherMethod",
  ]);
  assertSetsEqual(result, expected);
});
