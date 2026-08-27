"use strict";

/* global browser */

/* import-globals-from head_siteContainer.js */
loadTestSubscript("head_siteContainer.js");

// Runs aFn with an extension whose blocking webRequest listener is aBackground,
// granted the permissions it needs to divert main_frame loads of example.org.
// A listener left behind would divert the loads of every later task, so the
// extension is unloaded whatever happens.
async function withRedirectExtension(aBackground, aExtra, aFn) {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      manifest_version: 2,
      permissions: [
        "webRequest",
        "webRequestBlocking",
        "https://example.org/*",
      ],
      ...aExtra?.manifest,
    },
    files: aExtra?.files,
    background: aBackground,
  });
  await extension.startup();
  try {
    await aFn();
  } finally {
    await extension.unload();
  }
}

// The switch is sticky across schemes: a destination bound to nothing keeps the
// container the load already runs in, so the user sees the tab it lands in.
add_task(
  async function test_webext_redirect_to_moz_extension_keeps_container() {
    function background() {
      browser.webRequest.onBeforeRequest.addListener(
        () => ({ redirectUrl: browser.runtime.getURL("ext_page.html") }),
        { urls: ["*://example.org/*ext_redirect*"], types: ["main_frame"] },
        ["blocking"]
      );
    }

    await withRedirectExtension(
      background,
      {
        manifest: { web_accessible_resources: ["ext_page.html"] },
        files: {
          "ext_page.html": "<!DOCTYPE html><html><body>ext page</body></html>",
        },
      },
      async () => {
        let { tab, retargeted } = await retargetFrom(
          OTHER_CONTAINER,
          BOUND_CONTAINER,
          BASE_ORG + "blank.html?ext_redirect",
          "The moz-extension: redirect target kept the bound container",
          {
            wantLoad: url =>
              url.startsWith("moz-extension://") &&
              url.endsWith("ext_page.html"),
          }
        );

        // The user must see where the load actually ended up.
        ok(retargeted.selected, "The new tab is selected");
        let extURI = retargeted.linkedBrowser.currentURI.spec;
        ok(
          extURI.startsWith("moz-extension://") &&
            extURI.endsWith("ext_page.html"),
          `The new tab holds the extension URI (${extURI})`
        );
        is(gURLBar.value, extURI, "The URL bar shows the extension URI");

        is(
          retargeted.linkedBrowser.remoteType,
          E10SUtils.EXTENSION_REMOTE_TYPE,
          "The extension page runs in the extension process"
        );

        await assertLeftBehind(
          tab,
          URL_COM,
          OTHER_CONTAINER,
          "The original tab"
        );

        BrowserTestUtils.removeTab(retargeted);
        BrowserTestUtils.removeTab(tab);
      }
    );
  }
);

// Same as above with a data: URI, whose principal is a null principal.
add_task(async function test_webext_redirect_to_data_keeps_container() {
  function background() {
    browser.webRequest.onBeforeRequest.addListener(
      () => ({
        redirectUrl:
          "data:text/html,<!DOCTYPE html><html><body>data</body></html>",
      }),
      { urls: ["*://example.org/*data_redirect*"], types: ["main_frame"] },
      ["blocking"]
    );
  }

  await withRedirectExtension(background, null, async () => {
    let { tab, retargeted } = await retargetFrom(
      OTHER_CONTAINER,
      BOUND_CONTAINER,
      BASE_ORG + "blank.html?data_redirect",
      "The data: redirect target kept the bound container",
      { wantLoad: url => url.startsWith("data:text/html,") }
    );

    await assertLeftBehind(tab, URL_COM, OTHER_CONTAINER, "The original tab");

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// A stream filter leaves the channel on the bound http origin, so the rewritten
// document is retargeted like any other response from that site.
add_task(async function test_webext_stream_filter_retargets() {
  function background() {
    browser.webRequest.onBeforeRequest.addListener(
      details => {
        let filter = browser.webRequest.filterResponseData(details.requestId);
        filter.ondata = () => {
          // Discard the original body.
        };
        filter.onstop = () => {
          filter.write(
            new TextEncoder().encode(
              "<!DOCTYPE html><html><body>FILTERED</body></html>"
            )
          );
          filter.close();
        };
        return {};
      },
      { urls: ["*://example.org/*stream_filter*"], types: ["main_frame"] },
      ["blocking"]
    );
  }

  await withRedirectExtension(background, null, async () => {
    let url = BASE_ORG + "blank.html?stream_filter";
    let { tab, retargeted } = await retargetFrom(
      OTHER_CONTAINER,
      BOUND_CONTAINER,
      url,
      "Stream-filtered response landed in the bound container"
    );

    let body = await SpecialPowers.spawn(
      retargeted.linkedBrowser,
      [],
      () => content.document.body.textContent
    );
    is(body.trim(), "FILTERED", "Body was replaced by the stream filter");

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});
