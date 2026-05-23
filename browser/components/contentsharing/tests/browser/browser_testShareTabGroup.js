/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  TabGroupTestUtils: "resource://testing-common/TabGroupTestUtils.sys.mjs",
});

add_task(async function test_handleShareTabGroup() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await withContentSharingMockServer(async server => {
    let tabs = [
      BrowserTestUtils.addTab(gBrowser, "https://example.com"),
      BrowserTestUtils.addTab(gBrowser, "https://example.com?1"),
    ];

    await Promise.all(
      tabs.map(async t => {
        await BrowserTestUtils.browserLoaded(t.linkedBrowser);
      })
    );

    const tabGroup = gBrowser.addTabGroup(tabs, {
      label: "My tab group",
    });

    await ContentSharingUtils.handleShareTabGroup(tabGroup);
    Assert.equal(
      server.requests.length,
      1,
      "Server received exactly one request"
    );
    const body = server.requests[0].body;

    await assertContentSharingModal(window, {
      share: body,
      error: null,
      warning: null,
      url: server.mockResponse.url,
      isSchemaValid: true,
      isSignedIn: true,
      loadingPromise: null,
    });

    Assert.equal(body.type, "tab_group", "Share type is 'tab_group'");
    Assert.equal(body.links.length, 2, "Share contains 2 links");
    Assert.equal(
      body.links[0].url,
      tabs[0].linkedBrowser.currentURI.displaySpec,
      "First link URL matches tab 1"
    );
    Assert.equal(
      body.links[1].url,
      tabs[1].linkedBrowser.currentURI.displaySpec,
      "Second link URL matches tab 2"
    );

    const gleanData = Glean.collectionShare.dialogOpen.testGetValue();
    Assert.equal(gleanData.length, 1, "Recorded dialogOpen once");
    Assert.equal(
      gleanData[0].extra.signed_in,
      "true",
      "Test user should be signed in"
    );
    Assert.equal(
      gleanData[0].extra.share_type,
      "tab_group",
      "Share type should be tab_group"
    );

    await lazy.TabGroupTestUtils.removeTabGroup(tabGroup);
    Services.fog.testResetFOG();
  });
});
