/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// This test makes sure that the Add exception button only shows up
// when the skipReason indicates that the domain could not be resolved.
// If instead there is a problem with the TRR connection, then we don't
// show the exception button.
add_task(async function exceptionButtonTRROnly() {
  let browser = await loadTRRErrorPage();

  await SpecialPowers.spawn(browser, [], async function () {
    const doc = content.document;
    ok(
      doc.documentURI.startsWith("about:neterror"),
      "Should be showing error page"
    );

    let titleEl;
    let actualDataL10nID;

    const netErrorCard = doc.querySelector("net-error-card");
    if (netErrorCard) {
      const card = netErrorCard.wrappedJSObject;
      await card.getUpdateComplete();

      titleEl = card.errorTitle;
    } else {
      titleEl = doc.querySelector(".title-text");

      const trrExceptionButton = await ContentTaskUtils.waitForCondition(
        () => doc.getElementById("trrExceptionButton"),
        "Waiting for trrExceptionButton"
      );
      Assert.equal(
        trrExceptionButton.hidden,
        true,
        "Exception button should be hidden for TRR service failures"
      );
    }

    actualDataL10nID = titleEl.getAttribute("data-l10n-id");
    is(
      actualDataL10nID,
      "neterror-dns-not-found-title",
      "Correct error page title is set"
    );
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  resetTRRPrefs();
});
