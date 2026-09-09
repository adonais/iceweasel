/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_ORIGIN = "https://example.com";

/* Verifies that items on the page info page are properly disabled
   when the corresponding policies are locked */
add_task(async function test_pageinfo_permissions() {
  await setupPolicyEngineWithJson({
    policies: {
      Permissions: {
        Camera: {
          BlockNewRequests: true,
          Locked: true,
        },
        Microphone: {
          BlockNewRequests: true,
          Locked: true,
        },
        Location: {
          BlockNewRequests: true,
          Locked: true,
        },
        Notifications: {
          BlockNewRequests: true,
          Locked: true,
        },
        VirtualReality: {
          BlockNewRequests: true,
          Locked: true,
        },
        Autoplay: {
          Default: "block-audio",
          Locked: true,
        },
        ScreenShare: {
          BlockNewRequests: true,
          Locked: true,
        },
      },
      InstallAddonsPermission: {
        Default: false,
      },
      PopupBlocking: {
        Locked: true,
      },
      Cookies: {
        Locked: true,
      },
    },
  });

  let permissions = [
    "geo",
    "autoplay-media",
    "install",
    "popup",
    "desktop-notification",
    "cookie",
    "camera",
    "microphone",
    "xr",
    "screen",
  ];

  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async function () {
    let pageInfo = BrowserCommands.pageInfo(TEST_ORIGIN, "permTab");
    await BrowserTestUtils.waitForEvent(pageInfo, "load");

    for (let i = 0; i < permissions.length; i++) {
      let permission = permissions[i];
      let checkbox = await TestUtils.waitForCondition(() =>
        pageInfo.document.getElementById(`${permission}Def`)
      );

      ok(checkbox.disabled, `${permission} checkbox should be disabled`);
    }

    pageInfo.close();
  });
});

function assertCookieControlsDisabled(pageInfo) {
  let checkbox = pageInfo.document.getElementById("cookieDef");
  ok(checkbox.disabled, "cookie checkbox should be disabled");
  const command = pageInfo.document.getElementById("cmd_cookieToggle");
  ok(command.hasAttribute("disabled"), "cookie command should be disabled");
  const radios = pageInfo.document
    .getElementById("cookieRadioGroup")
    .querySelectorAll("radio");
  for (let radio of radios) {
    ok(radio.disabled, `cookie radio ${radio.id} should be disabled`);
  }
}

const BLOCKED_ORIGIN = "https://example.org";

/* Verifies that when the Cookies policy locks the cookie behavior pref, both
   the "use default" checkbox and the cookie radio group are disabled in Page
   Info. */
add_task(async function test_pageinfo_cookie_behavior_locked() {
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Locked: true,
      },
    },
  });

  await BrowserTestUtils.withNewTab(TEST_ORIGIN, async function () {
    let pageInfo = BrowserCommands.pageInfo(TEST_ORIGIN, "permTab");
    await BrowserTestUtils.waitForEvent(pageInfo, "load");

    await BrowserTestUtils.waitForMutationCondition(
      pageInfo.document,
      { childList: true, subtree: true, attributeFilter: ["disabled"] },
      () => {
        let checkbox = pageInfo.document.getElementById("cookieDef");
        return checkbox && checkbox.disabled;
      }
    );
    assertCookieControlsDisabled(pageInfo);

    pageInfo.close();
  });
});

/* Verifies that a site whose cookie permission was set by policy (via the
   Cookies.Block list) has its controls disabled in Page Info even when 
   the cookie behavior pref itself isn't locked. */
add_task(async function test_pageinfo_cookie_per_site_policy() {
  await setupPolicyEngineWithJson({
    policies: {
      Cookies: {
        Block: [BLOCKED_ORIGIN],
      },
    },
  });

  await BrowserTestUtils.withNewTab(BLOCKED_ORIGIN, async function () {
    let pageInfo = BrowserCommands.pageInfo(BLOCKED_ORIGIN, "permTab");
    await BrowserTestUtils.waitForEvent(pageInfo, "load");

    await BrowserTestUtils.waitForMutationCondition(
      pageInfo.document,
      { childList: true, subtree: true, attributeFilter: ["disabled"] },
      () => {
        let checkbox = pageInfo.document.getElementById("cookieDef");
        return checkbox && checkbox.disabled;
      }
    );
    assertCookieControlsDisabled(pageInfo);

    pageInfo.close();
  });
});
