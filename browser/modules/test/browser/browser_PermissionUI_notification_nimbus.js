/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PermissionUI } = ChromeUtils.importESModule(
  "resource:///modules/PermissionUI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);
const { ExperimentAPI } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const FEATURE_ID = "webNotificationsPermissionUi";
const NOTIFICATION_ID = "web-notifications";
const PERMISSION_KEY = "desktop-notification";
const TEST_URL = "https://example.com";

const gBrowserBundle = Services.strings.createBundle(
  "chrome://browser/locale/browser.properties"
);
const DEFAULT_HEADLINE = gBrowserBundle.formatStringFromName(
  "webNotifications.receiveFromSite3",
  ["<>"]
);
const DEFAULT_ALLOW_LABEL = gBrowserBundle.GetStringFromName(
  "webNotifications.allow2"
);
const DEFAULT_ALWAYS_BLOCK_LABEL = gBrowserBundle.GetStringFromName(
  "webNotifications.alwaysBlock"
);
const DEFAULT_PRIVATE_BLOCK_LABEL = gBrowserBundle.GetStringFromName(
  "webNotifications.block"
);

const gPermissionsL10n = new Localization(["browser/permissions.ftl"], true);
const EXISTING_L10N_ID = "perm-persistent-storage-remember";

const TREATMENT = {
  headline: "Stay in the loop with <>",
  body: "Get order updates and delivery alerts.",
  primaryCtaLabel: "Yes, notify me",
  primaryCtaAccessKey: "Y",
  secondaryCtaLabel: "No thanks",
  secondaryCtaAccessKey: "N",
  logoUrl: "https://example.com/logo.png",
};

add_setup(async function () {
  await ExperimentAPI.ready();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.webnotifications.requireuserinteraction", false],
      [
        "toolkit.telemetry.site_categories",
        JSON.stringify({ "example.com": "email" }),
      ],
    ],
  });
});

async function showModalPrompt(browser, win = window) {
  let mockRequest = makeMockPermissionRequest(browser);
  let prompt = new PermissionUI.DesktopNotificationPermissionPrompt(
    mockRequest
  );
  let shownPromise = BrowserTestUtils.waitForEvent(
    win.PopupNotifications.panel,
    "popupshown"
  );
  prompt.prompt();
  await shownPromise;
  let notification = win.PopupNotifications.getNotification(
    NOTIFICATION_ID,
    browser
  );
  Assert.ok(notification, "The notification modal should be shown");
  return { mockRequest, prompt, notification };
}

async function hidePrompt(browser, win = window) {
  let notification = win.PopupNotifications.getNotification(
    NOTIFICATION_ID,
    browser
  );
  if (!notification) {
    return;
  }
  let panel = win.PopupNotifications.panel;
  if (panel.state == "open" || panel.state == "showing") {
    let hiddenPromise = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    notification.remove();
    await hiddenPromise;
  } else {
    notification.remove();
  }
}

function cleanupPrincipalPermission(browser) {
  SitePermissions.removeFromPrincipal(
    browser.contentPrincipal,
    PERMISSION_KEY,
    browser
  );
}

function assertDefaultCopy(notification) {
  Assert.equal(
    notification.message,
    DEFAULT_HEADLINE,
    "Headline should be the default copy"
  );
  Assert.ok(!notification.options.hintText, "No hint text by default");
  Assert.equal(
    notification.mainAction.label,
    DEFAULT_ALLOW_LABEL,
    "Allow label should be the default copy"
  );
  Assert.equal(
    notification.secondaryActions[0].label,
    DEFAULT_ALWAYS_BLOCK_LABEL,
    "Block label should be the default copy"
  );
  Assert.ok(
    !notification.options.popupIconURL,
    "No custom logo by default (default icon shown)"
  );
}

add_task(async function test_control_empty_content_records_exposure() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: {},
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let sandbox = sinon.createSandbox();
      sandbox.spy(NimbusFeatures[FEATURE_ID], "recordExposureEvent");

      let { notification } = await showModalPrompt(browser);
      assertDefaultCopy(notification);
      Assert.ok(
        NimbusFeatures[FEATURE_ID].recordExposureEvent.calledOnce,
        "Exposure recorded for the empty-content control branch"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
      sandbox.restore();
    }
  );

  await doCleanup();
});

add_task(async function test_treatment_renders_all_variables() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: TREATMENT,
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let sandbox = sinon.createSandbox();
      sandbox.spy(NimbusFeatures[FEATURE_ID], "recordExposureEvent");

      let { notification } = await showModalPrompt(browser);
      Assert.equal(
        notification.message,
        TREATMENT.headline,
        "Headline overridden by treatment"
      );
      Assert.equal(
        notification.options.hintText,
        TREATMENT.body,
        "Body rendered as hint text"
      );
      Assert.equal(
        notification.mainAction.label,
        TREATMENT.primaryCtaLabel,
        "Allow label overridden"
      );
      Assert.equal(
        notification.mainAction.accessKey,
        TREATMENT.primaryCtaAccessKey,
        "Allow access key overridden"
      );
      Assert.equal(
        notification.secondaryActions[0].label,
        TREATMENT.secondaryCtaLabel,
        "Block label overridden"
      );
      Assert.equal(
        notification.secondaryActions[0].accessKey,
        TREATMENT.secondaryCtaAccessKey,
        "Block access key overridden"
      );
      Assert.equal(
        notification.options.popupIconURL,
        TREATMENT.logoUrl,
        "Logo rendered via popupIconURL"
      );
      Assert.ok(
        NimbusFeatures[FEATURE_ID].recordExposureEvent.calledOnce,
        "Exposure recorded for the treatment branch"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
      sandbox.restore();
    }
  );

  await doCleanup();
});

add_task(async function test_targeting_match() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: {
      headline: TREATMENT.headline,
      activationTargeting: "webNotificationSiteCategory == 'email'",
    },
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let sandbox = sinon.createSandbox();
      sandbox.spy(NimbusFeatures[FEATURE_ID], "recordExposureEvent");

      let { notification } = await showModalPrompt(browser);
      Assert.equal(
        notification.message,
        TREATMENT.headline,
        "Headline applied when targeting matches"
      );
      Assert.ok(
        NimbusFeatures[FEATURE_ID].recordExposureEvent.calledOnce,
        "Exposure recorded when targeting matches"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
      sandbox.restore();
    }
  );

  await doCleanup();
});

add_task(async function test_targeting_miss() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: {
      headline: TREATMENT.headline,
      activationTargeting: "webNotificationSiteCategory == 'social'",
    },
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let sandbox = sinon.createSandbox();
      sandbox.spy(NimbusFeatures[FEATURE_ID], "recordExposureEvent");

      let { notification } = await showModalPrompt(browser);
      assertDefaultCopy(notification);
      Assert.ok(
        NimbusFeatures[FEATURE_ID].recordExposureEvent.notCalled,
        "No exposure recorded when targeting does not match"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
      sandbox.restore();
    }
  );

  await doCleanup();
});

add_task(async function test_actions_still_work() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: TREATMENT,
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let principal = browser.contentPrincipal;

      let { mockRequest } = await showModalPrompt(browser);
      await clickSecondaryAction();
      let perm = SitePermissions.getForPrincipal(
        principal,
        PERMISSION_KEY,
        browser
      );
      Assert.equal(perm.state, SitePermissions.BLOCK, "Block grants BLOCK");
      Assert.equal(
        perm.scope,
        SitePermissions.SCOPE_PERSISTENT,
        "Block is persistent in a normal window"
      );
      Assert.ok(mockRequest._cancelled, "Block cancels the request");
      cleanupPrincipalPermission(browser);

      ({ mockRequest } = await showModalPrompt(browser));
      await clickMainAction();
      perm = SitePermissions.getForPrincipal(
        principal,
        PERMISSION_KEY,
        browser
      );
      Assert.equal(perm.state, SitePermissions.ALLOW, "Allow grants ALLOW");
      Assert.equal(
        perm.scope,
        SitePermissions.SCOPE_PERSISTENT,
        "Allow is persistent"
      );
      Assert.ok(mockRequest._allowed, "Allow allows the request");
      cleanupPrincipalPermission(browser);
    }
  );

  await doCleanup();
});

add_task(async function test_private_browsing_keeps_default_block_label() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: TREATMENT,
  });

  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });

  try {
    await BrowserTestUtils.withNewTab(
      { gBrowser: privateWin.gBrowser, url: TEST_URL },
      async function (browser) {
        let principal = browser.contentPrincipal;
        let { notification } = await showModalPrompt(browser, privateWin);

        Assert.equal(
          notification.message,
          TREATMENT.headline,
          "Headline still overridden in private browsing"
        );
        Assert.equal(
          notification.mainAction.label,
          TREATMENT.primaryCtaLabel,
          "Allow label still overridden in private browsing"
        );

        Assert.equal(
          notification.secondaryActions[0].label,
          DEFAULT_PRIVATE_BLOCK_LABEL,
          "Block label keeps the default in private browsing (not relabeled)"
        );
        Assert.notEqual(
          notification.secondaryActions[0].label,
          TREATMENT.secondaryCtaLabel,
          "Treatment secondary label is not applied in private browsing"
        );

        let node = privateWin.PopupNotifications.panel.childNodes[0];
        let hiddenPromise = BrowserTestUtils.waitForEvent(
          privateWin.PopupNotifications.panel,
          "popuphidden"
        );
        await node.secondaryButton.updateComplete;
        node.secondaryButton.click();
        await hiddenPromise;

        let perm = SitePermissions.getForPrincipal(
          principal,
          PERMISSION_KEY,
          browser
        );
        Assert.equal(perm.state, SitePermissions.BLOCK, "Block grants BLOCK");
        Assert.equal(
          perm.scope,
          SitePermissions.SCOPE_TEMPORARY,
          "Block scope is unchanged in private browsing (temporary, not persisted)"
        );
        cleanupPrincipalPermission(browser);
      }
    );
  } finally {
    await BrowserTestUtils.closeWindow(privateWin);
    await doCleanup();
  }
});

add_task(
  async function test_no_user_gesture_shows_post_prompt_records_exposure() {
    let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
      featureId: FEATURE_ID,
      value: TREATMENT,
    });

    await SpecialPowers.pushPrefEnv({
      set: [["dom.webnotifications.requireuserinteraction", true]],
    });

    await BrowserTestUtils.withNewTab(
      { gBrowser, url: TEST_URL },
      async function (browser) {
        let sandbox = sinon.createSandbox();
        sandbox.spy(NimbusFeatures[FEATURE_ID], "recordExposureEvent");

        let mockRequest = makeMockPermissionRequest(browser);
        let prompt = new PermissionUI.DesktopNotificationPermissionPrompt(
          mockRequest
        );
        await prompt.prompt();

        let notification = PopupNotifications.getNotification(
          NOTIFICATION_ID,
          browser
        );
        Assert.ok(
          !notification || notification.dismissed,
          "No modal shown without a user gesture"
        );
        Assert.ok(mockRequest._cancelled, "The request is cancelled");
        Assert.ok(
          NimbusFeatures[FEATURE_ID].recordExposureEvent.calledOnce,
          "Exposure recorded for the post-prompt"
        );

        await hidePrompt(browser);
        cleanupPrincipalPermission(browser);
        sandbox.restore();
      }
    );

    await SpecialPowers.popPrefEnv();
    await doCleanup();
  }
);

add_task(async function test_post_prompt_renders_treatment() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: TREATMENT,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["dom.webnotifications.requireuserinteraction", true]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let mockRequest = makeMockPermissionRequest(browser);
      let prompt = new PermissionUI.DesktopNotificationPermissionPrompt(
        mockRequest
      );
      await prompt.prompt();

      let notification = PopupNotifications.getNotification(
        NOTIFICATION_ID,
        browser
      );
      Assert.ok(
        notification && notification.dismissed,
        "The quiet post-prompt is shown dismissed"
      );
      Assert.equal(
        notification.message,
        TREATMENT.headline,
        "Post-prompt headline overridden by treatment"
      );
      Assert.equal(
        notification.options.popupIconURL,
        TREATMENT.logoUrl,
        "Post-prompt renders the treatment logo"
      );
      Assert.equal(
        notification.mainAction.label,
        TREATMENT.primaryCtaLabel,
        "Post-prompt Allow label overridden by treatment"
      );
      Assert.equal(
        notification.secondaryActions[0].label,
        TREATMENT.secondaryCtaLabel,
        "Post-prompt block label overridden by treatment (normal window)"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
    }
  );

  await SpecialPowers.popPrefEnv();
  await doCleanup();
});

add_task(async function test_intree_l10n_id_resolves() {
  let expected = gPermissionsL10n.formatValueSync(EXISTING_L10N_ID);
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: {
      body: "raw body that should be overridden",
      bodyL10nId: EXISTING_L10N_ID,
    },
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let { notification } = await showModalPrompt(browser);
      Assert.equal(
        notification.options.hintText,
        expected,
        "Body resolved from the in-tree Fluent id, taking precedence over raw"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
    }
  );

  await doCleanup();
});

add_task(async function test_headline_without_site_token_falls_back() {
  let doCleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: FEATURE_ID,
    value: { headline: "Turn on notifications" },
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: TEST_URL },
    async function (browser) {
      let { notification } = await showModalPrompt(browser);
      Assert.equal(
        notification.message,
        DEFAULT_HEADLINE,
        "Headline without the '<>' site-name token falls back to the default copy"
      );

      await hidePrompt(browser);
      cleanupPrincipalPermission(browser);
    }
  );

  await doCleanup();
});
