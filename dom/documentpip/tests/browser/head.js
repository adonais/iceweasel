/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

async function newTabWithPiP() {
  // Create a tab that can use the API (secure context)
  const tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "https://example.com",
    waitForLoad: true,
  });
  const browser = tab.linkedBrowser;

  // Open a document PiP window
  const chromePiPPromise = BrowserTestUtils.waitForNewWindow();
  await SpecialPowers.spawn(browser, [], async () => {
    content.document.notifyUserGestureActivation();
    await content.documentPictureInPicture.requestWindow();
  });
  const chromePiP = await chromePiPPromise;

  return [tab, chromePiP];
}
