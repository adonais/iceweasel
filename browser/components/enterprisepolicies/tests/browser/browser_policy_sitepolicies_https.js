/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

const SUPPORT_FILES_PATH =
  "browser/browser/components/enterprisepolicies/tests/browser";

async function waitForFrames(browser, count) {
  await TestUtils.waitForCondition(() => {
    let children = browser.browsingContext.children;
    if (children.length != count) {
      return false;
    }
    return children.every(child => child.currentURI.spec != "about:blank");
  }, `Waiting for ${count} frame(s) to load`);
}

add_task(async function test_https_only_upgrade() {
  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { HttpsOnly: true },
        },
      ],
    },
  });

  // HTTP on a matched domain should be upgraded to HTTPS.
  // eslint-disable-next-line sdl/no-insecure-url
  await BrowserTestUtils.withNewTab("http://example.com/", browser => {
    is(
      browser.currentURI.scheme,
      "https",
      "HTTP request to matching domain should be upgraded to HTTPS by enterprise policy"
    );
  });

  // HTTP on an unmatched domain should not be upgraded.
  // eslint-disable-next-line sdl/no-insecure-url
  await BrowserTestUtils.withNewTab("http://example.org/", browser => {
    is(
      browser.currentURI.scheme,
      "http",
      "HTTP request to non-matching domain should not be upgraded"
    );
  });
});

add_task(async function test_https_only_subresource_upgrade() {
  // HTTP iframes on an HTTPS page are active mixed content and get blocked
  // before reaching the network stack where our enterprise policy upgrade
  // fires. Disable mixed content blocking so the HTTP requests reach
  // ShouldSecureUpgradeNoHSTS and the policy can be exercised.
  await SpecialPowers.pushPrefEnv({
    set: [["security.mixed_content.block_active_content", false]],
  });

  await setupPolicyEngineWithJson({
    policies: {
      SitePolicies: [
        {
          Match: ["*.example.com"],
          Policies: { HttpsOnly: true },
        },
      ],
    },
  });

  const subresourcePage = `${SUPPORT_FILES_PATH}/sitepolicies_https_subresource.html`;

  // Top-level page on matching domain: all HTTP subresources should be upgraded,
  // regardless of whether the subresource's own domain is in the policy.
  await BrowserTestUtils.withNewTab(
    `https://example.com/${subresourcePage}`,
    async browser => {
      await waitForFrames(browser, 2);

      is(
        browser.browsingContext.children[0].currentURI.scheme,
        "https",
        "HTTP subresource on matching domain should be upgraded when top-level is in policy"
      );
      is(
        browser.browsingContext.children[1].currentURI.scheme,
        "https",
        "HTTP subresource on non-matching domain should also be upgraded when top-level is in policy"
      );
    }
  );

  // Top-level page on non-matching domain: HTTP subresources should not be upgraded,
  // even if the subresource's own domain would be in the policy.
  await BrowserTestUtils.withNewTab(
    `https://example.org/${subresourcePage}`,
    async browser => {
      await waitForFrames(browser, 2);

      is(
        browser.browsingContext.children[0].currentURI.scheme,
        "http",
        "HTTP subresource on matching domain should not be upgraded when top-level is not in policy"
      );
      is(
        browser.browsingContext.children[1].currentURI.scheme,
        "http",
        "HTTP subresource on non-matching domain should not be upgraded when top-level is not in policy"
      );
    }
  );

  await SpecialPowers.popPrefEnv();
});
