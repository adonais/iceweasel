/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_handleShareTabGroup() {
  await withContentSharingMockServer(async server => {
    const tab1 = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com"
    );
    const tab2 = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/1"
    );
    const tabGroup = gBrowser.addTabGroup([tab1, tab2], {
      label: "My tab group",
    });

    let openedUrl;
    const origOpenWebLinkIn = window.openWebLinkIn;
    window.openWebLinkIn = (url, _where) => {
      openedUrl = url;
    };

    await ContentSharingUtils.handleShareTabGroup(tabGroup);
    // restore function after stubbing
    window.openWebLinkIn = origOpenWebLinkIn;

    Assert.equal(
      server.requests.length,
      1,
      "Server received exactly one request"
    );

    const body = server.requests[0].body;
    Assert.equal(body.type, "tab_group", "Share type is 'tab_group'");
    Assert.equal(body.links.length, 2, "Share contains 2 links");
    Assert.equal(
      body.links[0].url,
      tab1.linkedBrowser.currentURI.displaySpec,
      "First link URL matches tab 1"
    );
    Assert.equal(
      body.links[1].url,
      tab2.linkedBrowser.currentURI.displaySpec,
      "Second link URL matches tab 2"
    );
    Assert.equal(
      openedUrl,
      server.mockResponse.url,
      "openWebLinkIn was called with the share URL"
    );

    await gBrowser.removeTabGroup(tabGroup);
  });
});
