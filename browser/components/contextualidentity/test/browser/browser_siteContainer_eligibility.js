"use strict";

/* import-globals-from head_siteContainer.js */
loadTestSubscript("head_siteContainer.js");

// A pop-up inherits the opener's container, so OAuth flows are not broken.
add_task(async function test_popup_inherits_container() {
  let tab = await openTabIn(OTHER_CONTAINER);

  // window.open() behaves differently depending on the principal of its caller,
  // so the call must run as content and not as the system principal this
  // snippet is evaluated with.
  await SpecialPowers.spawn(tab.linkedBrowser, [URL_ORG], url => {
    let script = content.document.createElement("script");
    script.textContent = `
      let button = document.createElement("button");
      button.textContent = "open";
      button.addEventListener("click", () => window.open(${JSON.stringify(
        url
      )}));
      document.body.appendChild(button);
    `;
    content.document.body.appendChild(script);
  });

  let popupPromise = BrowserTestUtils.waitForNewTab(gBrowser, URL_ORG, true);
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "button",
    {},
    tab.linkedBrowser
  );
  let popup = await popupPromise;

  await assertContainer(
    popup,
    OTHER_CONTAINER,
    "Pop-up opening a bound site stays in the opener's container"
  );

  BrowserTestUtils.removeTab(popup);
  BrowserTestUtils.removeTab(tab);
});

// Without an opener the new tab is a group of its own, so the load is eligible
// and ends up in the bound container.
add_task(async function test_noopener_popup_switches() {
  let tab = await openTabIn(OTHER_CONTAINER);

  await SpecialPowers.spawn(tab.linkedBrowser, [URL_ORG], url => {
    let link = content.document.createElement("a");
    link.href = url;
    // target="_blank" implies noopener.
    link.target = "_blank";
    link.textContent = "open";
    content.document.body.appendChild(link);
  });

  let openedPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    URL_ORG,
    true,
    true
  );
  await BrowserTestUtils.synthesizeMouseAtCenter("a", {}, tab.linkedBrowser);
  let retargeted = await openedPromise;

  await assertContainer(
    retargeted,
    BOUND_CONTAINER,
    "A pop-up without an opener switches to the bound container"
  );
  await assertLeftBehind(tab, URL_COM, OTHER_CONTAINER, "The opener tab");

  BrowserTestUtils.removeTab(retargeted);
  BrowserTestUtils.removeTab(tab);
});

// Moving the load of a tab entangled in a BrowsingContextGroup would leave the
// opener reference pointing at the tab that stays behind.
add_task(async function test_opener_tab_does_not_switch() {
  let tab = await openTabIn(OTHER_CONTAINER);

  await SpecialPowers.spawn(tab.linkedBrowser, [URL_COM], url => {
    let link = content.document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "opener";
    link.textContent = "open";
    content.document.body.appendChild(link);
  });

  let popupPromise = BrowserTestUtils.waitForNewTab(gBrowser, URL_COM, true);
  await BrowserTestUtils.synthesizeMouseAtCenter("a", {}, tab.linkedBrowser);
  let popup = await popupPromise;

  gBrowser.selectedTab = tab;
  await assertNoRetarget(gBrowser, "Navigation of an opener tab", async () => {
    await navigateTo(tab, URL_ORG);
  });
  await assertContainer(
    tab,
    OTHER_CONTAINER,
    "Opener tab navigating to a bound site keeps its container"
  );

  BrowserTestUtils.removeTab(popup);
  BrowserTestUtils.removeTab(tab);
});

// Containers are not exposed in private browsing.
add_task(async function test_private_browsing_does_not_switch() {
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  let tab = win.gBrowser.selectedTab;

  await assertNoRetarget(win.gBrowser, "Private browsing load", () =>
    navigateTo(tab, URL_ORG)
  );

  is(tab.userContextId, 0, "Private tab stays in the default container");
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    let attrs = content.docShell.getOriginAttributes();
    Assert.equal(attrs.userContextId, 0, "docShell stays in default container");
    Assert.equal(attrs.privateBrowsingId, 1, "load happened in private mode");
  });

  let remoteType = tab.linkedBrowser.remoteType;
  ok(
    E10SUtils.isWebRemoteType(remoteType),
    `Private tab runs in a web content process (${remoteType})`
  );
  let processAttrs = processOriginAttributes(remoteType);
  is(
    processAttrs.userContextId,
    0,
    "The content process is not dedicated to a container"
  );
  is(
    processAttrs.privateBrowsingId,
    1,
    "The content process is dedicated to private browsing"
  );

  await BrowserTestUtils.closeWindow(win);
});

// Only top-level navigations are eligible: an iframe inherits its parent.
add_task(async function test_subframe_inherits_container() {
  let tab = await openTabIn(OTHER_CONTAINER);

  let subframeBC;
  await assertNoRetarget(gBrowser, "Subframe load", async () => {
    subframeBC = await SpecialPowers.spawn(
      tab.linkedBrowser,
      [URL_ORG],
      async url => {
        let iframe = content.document.createElement("iframe");
        let loaded = new Promise(resolve => {
          iframe.addEventListener("load", resolve, { once: true });
        });
        iframe.src = url;
        content.document.body.appendChild(iframe);
        await loaded;
        return iframe.browsingContext;
      }
    );
  });

  await SpecialPowers.spawn(subframeBC, [OTHER_CONTAINER], expected => {
    Assert.equal(
      content.docShell.getOriginAttributes().userContextId,
      expected,
      "Subframe to a bound site inherits the parent's container"
    );
  });

  let remoteType = subframeBC.currentRemoteType;
  ok(
    E10SUtils.isWebRemoteType(remoteType),
    `Subframe runs in a web content process (${remoteType})`
  );
  is(
    processOriginAttributes(remoteType).userContextId,
    OTHER_CONTAINER,
    "Subframe runs in a process of the parent's container"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_pref_disabled_does_not_switch() {
  await withPrefs(
    [["privacy.containers.switchDuringNavigation.enabled", false]],
    async () => {
      let tab = await openTabIn(OTHER_CONTAINER);

      await assertNoRetarget(gBrowser, "Load with the pref disabled", () =>
        navigateTo(tab, URL_ORG)
      );
      await assertContainer(
        tab,
        OTHER_CONTAINER,
        "Bound site stays in the tab's container when the feature is disabled"
      );

      BrowserTestUtils.removeTab(tab);
    }
  );
});

// The outer URI of a view-source: load is host-less, so there is nothing to key
// an association on. Note that the document still ends up with the principal of
// the inner http(s) URI, so we could reasonably decide to look through
// view-source: and retarget on the inner URI instead. We might want to revisit
// this behaviour in the future.
add_task(async function test_view_source_does_not_switch() {
  let tab = await openTabIn(OTHER_CONTAINER);

  let viewSourceURL = "view-source:" + URL_ORG;
  await assertNoRetarget(gBrowser, "view-source: load", () =>
    navigateTo(tab, viewSourceURL)
  );

  await assertContainer(
    tab,
    OTHER_CONTAINER,
    "view-source: of a bound site stays in the tab's container"
  );

  BrowserTestUtils.removeTab(tab);
});

// Blob URLs must not change container, as they are only resolvable in the
// container which created them.
add_task(async function test_blob_toplevel_does_not_switch() {
  let tab = await openTabIn(OTHER_CONTAINER);

  let blobURL = await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    let blob = new content.Blob(
      ["<!DOCTYPE html><html><body>blob</body></html>"],
      { type: "text/html" }
    );
    return content.URL.createObjectURL(blob);
  });

  // A blob created with the system principal would have different semantics.
  ok(
    blobURL.startsWith("blob:https://example.com/"),
    `The blob belongs to the page, not to the system principal (${blobURL})`
  );

  await assertNoRetarget(gBrowser, "Top-level blob: load", () =>
    navigateTo(tab, blobURL)
  );

  await assertContainer(
    tab,
    OTHER_CONTAINER,
    "Top-level blob: load does not switch container"
  );

  BrowserTestUtils.removeTab(tab);
});
