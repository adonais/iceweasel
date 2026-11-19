/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CLIENT_AUTH_URI = "chrome://pippki/content/clientauthask.xhtml";
const CLIENT_AUTH_HOSTNAME =
  "certificate-authentication.long-hostname-for-client-certificate-selection.with-additional-hostname-components.example.com";

add_task(async function test_client_auth_dialog_layout() {
  const { PromptUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/PromptUtils.sys.mjs"
  );
  const certs = [];
  for (const file of [
    "client-cert-via-intermediate.pem",
    "client-cert-with-ocsp-signing.pem",
  ]) {
    const pem = await IOUtils.readUTF8(getTestFilePath(file));
    certs.push(gCertDB.constructX509FromBase64(pemToBase64(pem)));
  }

  for (const windowModal of [false, true]) {
    const retVals = { cert: null, rememberDuration: 2 };
    const args = PromptUtils.objectToPropBag({
      hostname: CLIENT_AUTH_HOSTNAME,
      certArray: certs,
      retVals,
    });
    const loaded = TestUtils.topicObserved("cert-dialog-loaded");
    let subDialog;
    let closedPromise;
    if (windowModal) {
      closedPromise = gDialogBox.open(CLIENT_AUTH_URI, args);
      subDialog = gDialogBox.dialog;
    } else {
      const dialogBox = gBrowser.getTabDialogBox(gBrowser.selectedBrowser);
      ({ closedPromise } = dialogBox.open(CLIENT_AUTH_URI, {}, args));
      subDialog = dialogBox.getTabDialogManager()._topDialog;
    }

    try {
      await loaded;
      await subDialog._dialogReady;
      const doc = subDialog._frame.contentDocument;
      const win = doc.defaultView;
      const dialog = doc.getElementById("certAuthAsk");

      ok(
        doc
          .getElementById("clientAuthSiteIdentification")
          .textContent.includes(CLIENT_AUTH_HOSTNAME),
        "The complete hostname is displayed"
      );
      const heading = doc.getElementById("clientAuthSiteIdentification");
      Assert.greater(
        heading.getBoundingClientRect().height,
        parseFloat(win.getComputedStyle(heading).fontSize) * 1.5,
        "The hostname exercises a wrapping heading"
      );
      const frameRect = subDialog._frame.getBoundingClientRect();
      for (const name of ["accept", "cancel"]) {
        const button = dialog.getButton(name);
        const rect = button.getBoundingClientRect();
        ok(rect.width > 0 && rect.height > 0, `${name} has a visible size`);
        ok(
          rect.top >= 0 && rect.bottom <= win.innerHeight,
          `${name} fits vertically in the ${windowModal ? "window" : "tab"} dialog`
        );
        ok(
          rect.left >= 0 && rect.right <= win.innerWidth,
          `${name} fits horizontally in the dialog`
        );
        ok(
          frameRect.top + rect.top >= 0 &&
            frameRect.top + rect.bottom <= window.innerHeight,
          `${name} fits vertically in the browser window`
        );
        ok(
          frameRect.left + rect.left >= 0 &&
            frameRect.left + rect.right <= window.innerWidth,
          `${name} fits horizontally in the browser window`
        );
        ok(!button.disabled, `${name} is enabled`);
      }

      const selector = doc.getElementById("nicknames");
      const marker = selector.shadowRoot.querySelector("dropmarker");
      const markerRect = marker.getBoundingClientRect();
      const selectorRect = selector.getBoundingClientRect();
      ok(
        markerRect.width > 0 && markerRect.height > 0,
        "The certificate selector has a visible dropdown arrow"
      );
      is(
        win.getComputedStyle(marker).visibility,
        "visible",
        "The dropdown arrow is not hidden"
      );
      ok(
        markerRect.left >= selectorRect.left &&
          markerRect.right <= selectorRect.right &&
          markerRect.top >= selectorRect.top &&
          markerRect.bottom <= selectorRect.bottom,
        "The dropdown arrow fits inside the selector"
      );

      const popup = selector.menupopup;
      const shown = BrowserTestUtils.waitForEvent(popup, "popupshown");
      selector.open = true;
      await shown;
      is(selector.itemCount, 2, "Both certificates are available in the menu");
      const chosen = BrowserTestUtils.waitForEvent(selector, "command");
      popup.activateItem(selector.getItemAtIndex(1));
      await chosen;
      is(selector.selectedIndex, 1, "An alternate certificate can be selected");
      await TestUtils.waitForCondition(
        () =>
          doc
            .getElementById("clientAuthCertDetailsIssuedTo")
            .textContent.includes(certs[1].subjectName),
        "The details update to the selected certificate"
      );

      const rememberDuration = windowModal ? 1 : 0;
      doc.getElementById("rememberSetting").value = rememberDuration;
      dialog.getButton(windowModal ? "accept" : "cancel").click();
      await closedPromise;
      is(
        retVals.cert,
        windowModal ? certs[1] : null,
        "The certificate choice is returned"
      );
      is(
        retVals.rememberDuration,
        rememberDuration,
        "The remember setting is returned"
      );
    } finally {
      if (subDialog._openedURL) {
        subDialog.close();
      }
      await closedPromise;
    }
  }
});
