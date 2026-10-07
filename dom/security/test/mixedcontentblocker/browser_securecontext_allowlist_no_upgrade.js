"use strict";

/*
 * Description of the Test:
 * A host on dom.securecontext.allowlist is a secure context even though it is
 * served over plain http, so mixed content upgrading must leave its display
 * content alone. Two separate checks decide this and each one covers a case
 * the other misses, so both are exercised here: a page served from an
 * allowlisted host (which must not flag any of its subresources), and an
 * allowlisted resource embedded in a genuine https page (which must be exempt
 * on its own).
 *
 * file_scheme_probe.sjs only answers over http, so an image sourced from it
 * loads exactly when the request was not upgraded.
 */

const HTTP_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  // eslint-disable-next-line sdl/no-insecure-url
  "http://example.com"
);
const HTTPS_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.org"
);

const ALLOWLISTED_PAGE = HTTP_PATH + "file_securecontext_allowlist_page.html";
const HTTPS_PAGE = HTTPS_PATH + "file_securecontext_allowlist_https_page.html";

async function checkPage(browser, imageIds) {
  return SpecialPowers.spawn(browser, [imageIds], async function (ids) {
    const loaded = {};
    for (const id of ids) {
      const img = content.document.getElementById(id);
      loaded[id] = await new Promise(resolve => {
        if (img.complete) {
          resolve(img.naturalWidth > 0);
          return;
        }
        img.addEventListener("load", () => resolve(true), { once: true });
        img.addEventListener("error", () => resolve(false), { once: true });
      });
    }
    return { loaded, isSecureContext: content.isSecureContext };
  });
}

add_task(async function allowlisted_page_keeps_its_display_content() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["security.mixed_content.upgrade_display_content", true],
      ["dom.securecontext.allowlist", "example.com"],
    ],
  });

  await BrowserTestUtils.withNewTab(ALLOWLISTED_PAGE, async function (browser) {
    const { loaded, isSecureContext } = await checkPage(browser, [
      "same-host",
      "other-host",
    ]);
    ok(isSecureContext, "allowlisted host is still a secure context");
    ok(loaded["same-host"], "image on the allowlisted host was not upgraded");
    ok(
      loaded["other-host"],
      "image on a non-allowlisted host was not upgraded either, because the " +
        "embedding page is not served over https"
    );
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function allowlisted_resource_in_https_page() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["security.mixed_content.upgrade_display_content", true],
      ["dom.securecontext.allowlist", "example.com"],
    ],
  });

  await BrowserTestUtils.withNewTab(HTTPS_PAGE, async function (browser) {
    const { loaded, isSecureContext } = await checkPage(browser, [
      "allowlisted-host",
    ]);
    ok(isSecureContext, "sanity: the embedding page is a secure context");
    ok(
      loaded["allowlisted-host"],
      "allowlisted resource in an https page was not upgraded"
    );
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function non_allowlisted_content_is_still_upgraded() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["security.mixed_content.upgrade_display_content", true],
      ["dom.securecontext.allowlist", ""],
    ],
  });

  await BrowserTestUtils.withNewTab(HTTPS_PAGE, async function (browser) {
    const { loaded } = await checkPage(browser, ["allowlisted-host"]);
    ok(
      !loaded["allowlisted-host"],
      "with an empty allowlist the resource is still upgraded, and the probe " +
        "refuses the https request"
    );
  });

  await SpecialPowers.popPrefEnv();
});
