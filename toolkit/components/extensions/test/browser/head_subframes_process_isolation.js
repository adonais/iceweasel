/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function loadTestExtensionWithWebAccessibleResources() {
  return ExtensionTestUtils.loadExtension({
    manifest: {
      web_accessible_resources: ["page.html"],
    },
    files: {
      "page.html":
        "<!DOCTYPE html><html><body>extension subframe</body></html>",
    },
  });
}

function getDOMProcessParentByChildID(childID) {
  return ChromeUtils.getAllDOMProcesses().find(p => p.childID === childID);
}

function assertDOMProcessRemoteType({ childID, expectedRemoteType, msg }) {
  Assert.equal(
    getDOMProcessParentByChildID(childID)?.remoteType,
    expectedRemoteType,
    msg
  );
}

async function loadSubframeAndGetChildID(browser, extensionPageURL) {
  await SpecialPowers.spawn(browser, [extensionPageURL], async url => {
    await new Promise(resolve => {
      const iframe = content.document.createElement("iframe");
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.src = url;
      content.document.body.appendChild(iframe);
    });
  });
  is(browser.browsingContext.children.length, 1, "subframe was created");
  is(
    browser.browsingContext.children[0].currentWindowGlobal.documentURI.spec,
    extensionPageURL,
    "subframe loaded the expected extension page"
  );
  return browser.browsingContext.children[0].currentWindowGlobal.domProcess
    .childID;
}

// Load an extension subframe in a new tab for parentURL, and assert whether it
// is isolated in the extension process or loaded in the same process of its
// parent frame. parentRemoteType is the remoteType expected for the parent
// frame when Fission is enabled (and with Fission disabled "webIsolated" is
// expected to be "web").
async function assertExtensionSubframeProcess({
  parentURL,
  parentRemoteType,
  expectInExtensionProcess,
}) {
  const extension = loadTestExtensionWithWebAccessibleResources();
  await extension.startup();
  const extensionPageURL = `moz-extension://${extension.uuid}/page.html`;

  await BrowserTestUtils.withNewTab(parentURL, async browser => {
    const parentChildID =
      browser.browsingContext.currentWindowGlobal.domProcess.childID;
    const frameChildID = await loadSubframeAndGetChildID(
      browser,
      extensionPageURL
    );

    let expectedParentRemoteType = parentRemoteType;
    if (parentRemoteType === "webIsolated") {
      expectedParentRemoteType = SpecialPowers.useRemoteSubframes
        ? `${parentRemoteType}=${parentURL}`
        : "web";
    }
    assertDOMProcessRemoteType({
      childID: parentChildID,
      expectedRemoteType: expectedParentRemoteType,
      msg: "Parent frame process got the expected remoteType",
    });

    if (expectInExtensionProcess && SpecialPowers.useRemoteSubframes) {
      isnot(
        frameChildID,
        parentChildID,
        "extension subframe should be isolated in its own process"
      );
      assertDOMProcessRemoteType({
        childID: frameChildID,
        expectedRemoteType: "extension",
        msg: "Expect subframe process to have extension remoteType",
      });
    } else {
      is(
        frameChildID,
        parentChildID,
        "extension subframe should stay in the parent process"
      );
    }
  });

  await extension.unload();
}

function registerPrivilegedAboutTestPage(aboutPageName, pageURL) {
  return BrowserTestUtils.registerAboutPage(
    registerCleanupFunction,
    aboutPageName,
    pageURL,
    Ci.nsIAboutModule.URI_MUST_LOAD_IN_CHILD |
      Ci.nsIAboutModule.URI_CAN_LOAD_IN_PRIVILEGEDABOUT_PROCESS |
      Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT
  );
}
