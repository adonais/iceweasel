/**
 * These tests test the ability for the PermissionUI module to open
 * permission prompts to the user. It also tests to ensure that
 * add-ons can introduce their own permission prompts.
 */

"use strict";

const { PermissionUI } = ChromeUtils.importESModule(
  "resource:///modules/PermissionUI.sys.mjs"
);

const { PermissionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PermissionTestUtils.sys.mjs"
);

function setPermissionRequestOptions(request, values) {
  let options = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  for (let value of values) {
    let string = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    string.data = value;
    options.appendElement(string);
  }
  let type = {
    options,
    QueryInterface: ChromeUtils.generateQI(["nsIContentPermissionType"]),
  };
  let types = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  types.appendElement(type);
  request.types = types;
}

// Sends the "ml-model-download-progress" notification HWInferenceParent sends
// while a model downloads, carrying the same property bag.
function notifyModelDownloadProgress({
  token,
  progress = 0,
  currentLoaded = 0,
  totalLoaded = 0,
  total = 0,
  done = false,
  ok = false,
}) {
  let props = Cc["@mozilla.org/hash-property-bag;1"].createInstance(
    Ci.nsIWritablePropertyBag2
  );
  props.setPropertyAsAString("token", token);
  props.setPropertyAsInt32("progress", progress);
  props.setPropertyAsInt64("currentLoaded", currentLoaded);
  props.setPropertyAsInt64("totalLoaded", totalLoaded);
  props.setPropertyAsInt64("total", total);
  props.setPropertyAsBool("done", done);
  props.setPropertyAsBool("ok", ok);
  Services.obs.notifyObservers(props, "ml-model-download-progress");
}

/**
 * Tests the PermissionPromptForRequest prototype to ensure that a prompt
 * can be displayed. Does not test permission handling.
 */
add_task(async function test_permission_prompt_for_request() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com/",
    },
    async function (browser) {
      const kTestNotificationID = "test-notification";
      const kTestMessage = "Test message";
      let mainAction = {
        label: "Main",
        accessKey: "M",
      };
      let secondaryAction = {
        label: "Secondary",
        accessKey: "S",
      };

      let mockRequest = makeMockPermissionRequest(browser);
      class TestPrompt extends PermissionUI.PermissionPromptForRequest {
        get request() {
          return mockRequest;
        }
        get notificationID() {
          return kTestNotificationID;
        }
        get message() {
          return kTestMessage;
        }
        get promptActions() {
          return [mainAction, secondaryAction];
        }
      }
      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;
      let notification = PopupNotifications.getNotification(
        kTestNotificationID,
        browser
      );
      Assert.ok(notification, "Should have gotten the notification");

      Assert.equal(
        notification.message,
        kTestMessage,
        "Should be showing the right message"
      );
      Assert.equal(
        notification.mainAction.label,
        mainAction.label,
        "The main action should have the right label"
      );
      Assert.equal(
        notification.mainAction.accessKey,
        mainAction.accessKey,
        "The main action should have the right access key"
      );
      Assert.equal(
        notification.secondaryActions.length,
        1,
        "There should only be 1 secondary action"
      );
      Assert.equal(
        notification.secondaryActions[0].label,
        secondaryAction.label,
        "The secondary action should have the right label"
      );
      Assert.equal(
        notification.secondaryActions[0].accessKey,
        secondaryAction.accessKey,
        "The secondary action should have the right access key"
      );
      Assert.ok(
        notification.options.displayURI.equals(mockRequest.principal.URI),
        "Should be showing the URI of the requesting page"
      );

      let removePromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      notification.remove();
      await removePromise;
    }
  );
});

add_task(async function test_speech_recognition_model_download_progress() {
  await SpecialPowers.pushPrefEnv({
    set: [["security.notification_enable_delay", 0]],
  });

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com/",
    },
    async function (browser) {
      const progressToken = "test-speech-model-download";
      let request = makeMockPermissionRequest(browser);
      setPermissionRequestOptions(request, ["123", progressToken]);
      let elementAvailable = true;
      Object.defineProperty(request, "element", {
        configurable: true,
        get() {
          if (!elementAvailable) {
            throw Components.Exception("", Cr.NS_ERROR_FAILURE);
          }
          return browser;
        },
      });

      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new PermissionUI.SpeechRecognitionModelDownloadPermissionPrompt(
        request
      ).prompt();
      await shownPromise;

      let popup = getPopupNotificationNode();
      Assert.equal(
        popup.id,
        "speech-recognition-model-download-notification",
        "the consent prompt is shown first"
      );

      await popup.button.updateComplete;
      popup.button.click();

      await TestUtils.waitForCondition(
        () => request._allowed,
        "Waiting for permission allow callback"
      );
      elementAvailable = false;

      await TestUtils.waitForCondition(
        () =>
          PopupNotifications.panel.childNodes.length == 1 &&
          PopupNotifications.panel.firstElementChild.id ==
            "speech-recognition-model-download-progress-notification",
        "Waiting for progress notification"
      );

      popup = getPopupNotificationNode();
      let content = popup.querySelector(
        "#speech-recognition-model-download-progress-content"
      );
      let progress = popup.querySelector(
        "#speech-recognition-model-download-progress"
      );
      let status = popup.querySelector(
        "#speech-recognition-model-download-progress-status"
      );
      let footer = popup.querySelector(".panel-footer");

      Assert.ok(PopupNotifications.isPanelOpen, "progress doorhanger is open");
      Assert.ok(!content.hidden, "progress content is shown");
      Assert.ok(
        popup.hasAttribute("mainactiondisabled"),
        "the accept button is disabled while downloading"
      );
      let [cancelMessage] = new Localization(
        ["browser/permissions.ftl"],
        true
      ).formatMessagesSync([
        { id: "speech-recognition-model-download-cancel" },
      ]);
      Assert.equal(
        popup.secondaryButton.label,
        cancelMessage.attributes.find(attr => attr.name == "label").value,
        "the secondary button is the Cancel button"
      );

      notifyModelDownloadProgress({
        token: "other-token",
        progress: 7,
        totalLoaded: 7,
        total: 100,
      });
      Assert.equal(progress.value, 0, "wrong token did not update progress");

      notifyModelDownloadProgress({
        token: progressToken,
        progress: 42,
        totalLoaded: 42,
        total: 100,
      });
      await TestUtils.waitForCondition(
        () => progress.value == 42,
        "Waiting for progress update"
      );
      // Same shape as the downloads panel, see DownloadUtils.
      Assert.stringContains(
        status.textContent,
        "42 of 100 bytes",
        "the status includes the transfer progress"
      );
      Assert.stringContains(
        status.textContent,
        "/sec",
        "the status includes the transfer rate"
      );

      notifyModelDownloadProgress({
        token: progressToken,
        progress: 100,
        totalLoaded: 100,
        total: 100,
        done: true,
        ok: true,
      });

      let [okMessage] = new Localization(
        ["browser/permissions.ftl"],
        true
      ).formatMessagesSync([{ id: "speech-recognition-model-download-ok" }]);
      let okLabel = okMessage.attributes.find(
        attr => attr.name == "label"
      ).value;
      await TestUtils.waitForCondition(
        () => popup.secondaryButton.label == okLabel,
        "Waiting for the secondary button to become the OK button"
      );

      Assert.ok(
        BrowserTestUtils.isVisible(footer),
        "a completed download keeps a way to dismiss it"
      );
      Assert.ok(
        BrowserTestUtils.isHidden(popup.button),
        "there is nothing left to accept"
      );
      // A completed download also goes away by itself, after a few seconds.
      let hiddenPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      await hiddenPromise;
      Assert.ok(
        !request._cancelled,
        "accepted download notification removal should not cancel the request"
      );
      Assert.ok(
        !PopupNotifications.getNotification(
          "speech-recognition-model-download-progress",
          browser
        ),
        "progress notification was removed after completion"
      );

      let secondRequest = makeMockPermissionRequest(browser);
      setPermissionRequestOptions(secondRequest, ["123", "second-token"]);

      shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new PermissionUI.SpeechRecognitionModelDownloadPermissionPrompt(
        secondRequest
      ).prompt();
      await shownPromise;

      popup = getPopupNotificationNode();
      Assert.equal(
        popup.id,
        "speech-recognition-model-download-notification",
        "the next consent prompt is separate from progress"
      );

      await popup.button.updateComplete;
      popup.button.click();

      await TestUtils.waitForCondition(
        () =>
          PopupNotifications.panel.childNodes.length == 1 &&
          PopupNotifications.panel.firstElementChild.id ==
            "speech-recognition-model-download-progress-notification",
        "Waiting for second progress notification"
      );

      popup = getPopupNotificationNode();
      content = popup.querySelector(
        "#speech-recognition-model-download-progress-content"
      );
      progress = popup.querySelector(
        "#speech-recognition-model-download-progress"
      );
      status = popup.querySelector(
        "#speech-recognition-model-download-progress-status"
      );
      footer = popup.querySelector(".panel-footer");

      Assert.ok(
        !content.hidden,
        "new progress notification shows progress content"
      );
      Assert.equal(progress.value, 0, "new progress value starts at 0");
      Assert.equal(status.textContent, "", "new progress text starts empty");
      Assert.ok(
        popup.hasAttribute("model-download-in-progress"),
        "new progress notification is marked in progress"
      );
      Assert.ok(
        popup.hasAttribute("mainactiondisabled"),
        "new progress notification primary button is disabled"
      );
      Assert.ok(
        BrowserTestUtils.isVisible(footer),
        "new progress notification actions are visible"
      );

      hiddenPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      PopupNotifications.getNotification(
        "speech-recognition-model-download-progress",
        browser
      ).remove();
      await hiddenPromise;
    }
  );
});

// A failed download is the one outcome that never goes away by itself, so it
// has to keep a visible way to dismiss it and does not close when clicked out
// of.
add_task(async function test_speech_recognition_model_download_failure() {
  await SpecialPowers.pushPrefEnv({
    set: [["security.notification_enable_delay", 0]],
  });

  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com/",
    },
    async function (browser) {
      const progressToken = "test-speech-model-download-failure";
      let request = makeMockPermissionRequest(browser);
      setPermissionRequestOptions(request, ["123", progressToken]);
      let elementAvailable = true;
      Object.defineProperty(request, "element", {
        configurable: true,
        get() {
          if (!elementAvailable) {
            throw Components.Exception("", Cr.NS_ERROR_FAILURE);
          }
          return browser;
        },
      });

      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new PermissionUI.SpeechRecognitionModelDownloadPermissionPrompt(
        request
      ).prompt();
      await shownPromise;

      let popup = getPopupNotificationNode();

      await popup.button.updateComplete;
      popup.button.click();
      await TestUtils.waitForCondition(
        () => request._allowed,
        "Waiting for permission allow callback"
      );
      elementAvailable = false;

      await TestUtils.waitForCondition(
        () =>
          PopupNotifications.panel.childNodes.length == 1 &&
          PopupNotifications.panel.firstElementChild.id ==
            "speech-recognition-model-download-progress-notification",
        "Waiting for progress notification"
      );

      popup = getPopupNotificationNode();
      let footer = popup.querySelector(".panel-footer");

      notifyModelDownloadProgress({
        token: progressToken,
        progress: 40,
        totalLoaded: 40,
        total: 100,
        done: true,
        ok: false,
      });

      let [okMessage] = new Localization(
        ["browser/permissions.ftl"],
        true
      ).formatMessagesSync([{ id: "speech-recognition-model-download-ok" }]);
      let okLabel = okMessage.attributes.find(
        attr => attr.name == "label"
      ).value;
      await TestUtils.waitForCondition(
        () => popup.secondaryButton.label == okLabel,
        "Waiting for the secondary button to become the OK button"
      );

      Assert.ok(
        BrowserTestUtils.isVisible(footer),
        "a failed download keeps a way to dismiss it"
      );
      Assert.ok(
        BrowserTestUtils.isHidden(popup.button),
        "there is nothing left to accept"
      );
      await TestUtils.waitForTick();
      Assert.ok(
        PopupNotifications.isPanelOpen,
        "a failed download does not dismiss itself"
      );

      let hiddenPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      await popup.secondaryButton.updateComplete;
      popup.secondaryButton.click();
      await hiddenPromise;

      Assert.ok(
        !PopupNotifications.getNotification(
          "speech-recognition-model-download-progress",
          browser
        ),
        "the OK button removes the failed download notification"
      );
      Assert.ok(
        !request._cancelled,
        "dismissing a failed download does not cancel the settled request"
      );
    }
  );
});

/**
 * Tests that if the PermissionPrompt sets displayURI to false in popupOptions,
 * then there is no URI shown on the popupnotification.
 */
add_task(async function test_permission_prompt_for_popupOptions() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com/",
    },
    async function (browser) {
      const kTestNotificationID = "test-notification";
      const kTestMessage = "Test message";
      let mainAction = {
        label: "Main",
        accessKey: "M",
      };
      let secondaryAction = {
        label: "Secondary",
        accessKey: "S",
      };

      let mockRequest = makeMockPermissionRequest(browser);
      class TestPrompt extends PermissionUI.PermissionPromptForRequest {
        get request() {
          return mockRequest;
        }
        get notificationID() {
          return kTestNotificationID;
        }
        get message() {
          return kTestMessage;
        }
        get promptActions() {
          return [mainAction, secondaryAction];
        }
        get popupOptions() {
          return {
            displayURI: false,
          };
        }
      }
      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;
      let notification = PopupNotifications.getNotification(
        kTestNotificationID,
        browser
      );

      Assert.ok(
        !notification.options.displayURI,
        "Should not show the URI of the requesting page"
      );

      let removePromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      notification.remove();
      await removePromise;
    }
  );
});

/**
 * Tests that if the PermissionPrompt has the permissionKey
 * set that permissions can be set properly by the user. Also
 * ensures that callbacks for promptActions are properly fired.
 */
add_task(async function test_with_permission_key() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com",
    },
    async function (browser) {
      const kTestNotificationID = "test-notification";
      const kTestMessage = "Test message";
      const kTestPermissionKey = "test-permission-key";

      let allowed = false;
      let mainAction = {
        label: "Allow",
        accessKey: "M",
        action: SitePermissions.ALLOW,
        callback() {
          allowed = true;
        },
      };

      let denied = false;
      let secondaryAction = {
        label: "Deny",
        accessKey: "D",
        action: SitePermissions.BLOCK,
        callback() {
          denied = true;
        },
      };

      let mockRequest = makeMockPermissionRequest(browser);
      let principal = mockRequest.principal;
      registerCleanupFunction(function () {
        PermissionTestUtils.remove(principal.URI, kTestPermissionKey);
      });
      class TestPrompt extends PermissionUI.PermissionPromptForRequest {
        get request() {
          return mockRequest;
        }
        get notificationID() {
          return kTestNotificationID;
        }
        get permissionKey() {
          return kTestPermissionKey;
        }
        get message() {
          return kTestMessage;
        }
        get promptActions() {
          return [mainAction, secondaryAction];
        }
        get popupOptions() {
          return {
            checkbox: {
              label: "Remember this decision",
              show: true,
              checked: true,
            },
          };
        }
      }
      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;
      let notification = PopupNotifications.getNotification(
        kTestNotificationID,
        browser
      );
      Assert.ok(notification, "Should have gotten the notification");

      let curPerm = SitePermissions.getForPrincipal(
        principal,
        kTestPermissionKey,
        browser
      );
      Assert.equal(
        curPerm.state,
        SitePermissions.UNKNOWN,
        "Should be no permission set to begin with."
      );

      // First test denying the permission request without the checkbox checked.
      let popupNotification = getPopupNotificationNode();
      popupNotification.checkbox.checked = false;

      Assert.equal(
        notification.secondaryActions.length,
        1,
        "There should only be 1 secondary action"
      );
      await clickSecondaryAction();
      curPerm = SitePermissions.getForPrincipal(
        principal,
        kTestPermissionKey,
        browser
      );
      Assert.deepEqual(
        curPerm,
        {
          state: SitePermissions.BLOCK,
          scope: SitePermissions.SCOPE_TEMPORARY,
        },
        "Should have denied the action temporarily"
      );
      // Try getting the permission without passing the browser object (should fail).
      curPerm = PermissionTestUtils.getPermissionObject(
        principal.URI,
        kTestPermissionKey
      );
      Assert.equal(
        curPerm,
        null,
        "Should have made no permanent permission entry"
      );
      Assert.ok(denied, "The secondaryAction callback should have fired");
      Assert.ok(!allowed, "The mainAction callback should not have fired");
      Assert.ok(
        mockRequest._cancelled,
        "The request should have been cancelled"
      );
      Assert.ok(
        !mockRequest._allowed,
        "The request should not have been allowed"
      );

      // Clear the permission and pretend we never denied
      SitePermissions.removeFromPrincipal(
        principal,
        kTestPermissionKey,
        browser
      );
      denied = false;
      mockRequest._cancelled = false;

      // Bring the PopupNotification back up now...
      shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;

      // Test denying the permission request.
      Assert.equal(
        notification.secondaryActions.length,
        1,
        "There should only be 1 secondary action"
      );
      await clickSecondaryAction();
      curPerm = PermissionTestUtils.getPermissionObject(
        principal.URI,
        kTestPermissionKey
      );
      Assert.equal(
        curPerm.capability,
        Services.perms.DENY_ACTION,
        "Should have denied the action"
      );
      Assert.equal(curPerm.expireTime, 0, "Deny should be permanent");
      Assert.ok(denied, "The secondaryAction callback should have fired");
      Assert.ok(!allowed, "The mainAction callback should not have fired");
      Assert.ok(
        mockRequest._cancelled,
        "The request should have been cancelled"
      );
      Assert.ok(
        !mockRequest._allowed,
        "The request should not have been allowed"
      );

      // Clear the permission and pretend we never denied
      PermissionTestUtils.remove(principal.URI, kTestPermissionKey);
      denied = false;
      mockRequest._cancelled = false;

      // Bring the PopupNotification back up now...
      shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;

      // Test allowing the permission request.
      await clickMainAction();
      curPerm = PermissionTestUtils.getPermissionObject(
        principal.URI,
        kTestPermissionKey
      );
      Assert.equal(
        curPerm.capability,
        Services.perms.ALLOW_ACTION,
        "Should have allowed the action"
      );
      Assert.equal(curPerm.expireTime, 0, "Allow should be permanent");
      Assert.ok(!denied, "The secondaryAction callback should not have fired");
      Assert.ok(allowed, "The mainAction callback should have fired");
      Assert.ok(
        !mockRequest._cancelled,
        "The request should not have been cancelled"
      );
      Assert.ok(mockRequest._allowed, "The request should have been allowed");
    }
  );
});

/**
 * Tests that the onBeforeShow method will be called before
 * the popup appears.
 */
add_task(async function test_on_before_show() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com",
    },
    async function (browser) {
      const kTestNotificationID = "test-notification";
      const kTestMessage = "Test message";

      let mainAction = {
        label: "Test action",
        accessKey: "T",
      };

      let mockRequest = makeMockPermissionRequest(browser);
      let beforeShown = false;
      class TestPrompt extends PermissionUI.PermissionPromptForRequest {
        get request() {
          return mockRequest;
        }
        get notificationID() {
          return kTestNotificationID;
        }
        get message() {
          return kTestMessage;
        }
        get promptActions() {
          return [mainAction];
        }
        get popupOptions() {
          return {
            checkbox: {
              label: "Remember this decision",
              show: true,
              checked: true,
            },
          };
        }
        onBeforeShow() {
          beforeShown = true;
          return true;
        }
      }
      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      Assert.ok(beforeShown, "Should have called onBeforeShown");
      await shownPromise;
      let notification = PopupNotifications.getNotification(
        kTestNotificationID,
        browser
      );

      let removePromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popuphidden"
      );
      notification.remove();
      await removePromise;
    }
  );
});

/**
 * Tests that we can open a PermissionPrompt without wrapping a
 * nsIContentPermissionRequest.
 */
add_task(async function test_no_request() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com",
    },
    async function (browser) {
      const kTestNotificationID = "test-notification";
      let allowed = false;
      let mainAction = {
        label: "Allow",
        accessKey: "M",
        callback() {
          allowed = true;
        },
      };

      let denied = false;
      let secondaryAction = {
        label: "Deny",
        accessKey: "D",
        callback() {
          denied = true;
        },
      };

      const kTestMessage = "Test message with no request";
      let principal = browser.contentPrincipal;
      let beforeShown = false;
      class TestPrompt extends PermissionUI.PermissionPromptForRequest {
        get notificationID() {
          return kTestNotificationID;
        }
        get principal() {
          return principal;
        }
        get browser() {
          return browser;
        }
        get message() {
          return kTestMessage;
        }
        get promptActions() {
          return [mainAction, secondaryAction];
        }
        onBeforeShow() {
          beforeShown = true;
          return true;
        }
      }

      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      Assert.ok(beforeShown, "Should have called onBeforeShown");
      await shownPromise;
      let notification = PopupNotifications.getNotification(
        kTestNotificationID,
        browser
      );

      Assert.equal(
        notification.message,
        kTestMessage,
        "Should be showing the right message"
      );
      Assert.equal(
        notification.mainAction.label,
        mainAction.label,
        "The main action should have the right label"
      );
      Assert.equal(
        notification.mainAction.accessKey,
        mainAction.accessKey,
        "The main action should have the right access key"
      );
      Assert.equal(
        notification.secondaryActions.length,
        1,
        "There should only be 1 secondary action"
      );
      Assert.equal(
        notification.secondaryActions[0].label,
        secondaryAction.label,
        "The secondary action should have the right label"
      );
      Assert.equal(
        notification.secondaryActions[0].accessKey,
        secondaryAction.accessKey,
        "The secondary action should have the right access key"
      );
      Assert.ok(
        notification.options.displayURI.equals(principal.URI),
        "Should be showing the URI of the requesting page"
      );

      // First test denying the permission request.
      Assert.equal(
        notification.secondaryActions.length,
        1,
        "There should only be 1 secondary action"
      );
      await clickSecondaryAction();
      Assert.ok(denied, "The secondaryAction callback should have fired");
      Assert.ok(!allowed, "The mainAction callback should not have fired");

      shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;

      // Next test allowing the permission request.
      await clickMainAction();
      Assert.ok(allowed, "The mainAction callback should have fired");
    }
  );
});

/**
 * Tests that when the tab is moved to a different window, the notification
 * is transferred to the new window.
 */
add_task(async function test_window_swap() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: "https://example.com",
    },
    async function (browser) {
      const kTestNotificationID = "test-notification";
      const kTestMessage = "Test message";

      let mainAction = {
        label: "Test action",
        accessKey: "T",
      };
      let secondaryAction = {
        label: "Secondary",
        accessKey: "S",
      };

      let mockRequest = makeMockPermissionRequest(browser);
      class TestPrompt extends PermissionUI.PermissionPromptForRequest {
        get request() {
          return mockRequest;
        }
        get notificationID() {
          return kTestNotificationID;
        }
        get message() {
          return kTestMessage;
        }
        get promptActions() {
          return [mainAction, secondaryAction];
        }
      }
      let shownPromise = BrowserTestUtils.waitForEvent(
        PopupNotifications.panel,
        "popupshown"
      );
      new TestPrompt().prompt();
      await shownPromise;

      let newWindowOpened = BrowserTestUtils.waitForNewWindow();
      gBrowser.replaceTabWithWindow(gBrowser.selectedTab);
      let newWindow = await newWindowOpened;
      // We may have already opened the panel, because it was open before we moved the tab.
      if (newWindow.PopupNotifications.panel.state != "open") {
        shownPromise = BrowserTestUtils.waitForEvent(
          newWindow.PopupNotifications.panel,
          "popupshown"
        );
        new TestPrompt().prompt();
        await shownPromise;
      }

      let notification = newWindow.PopupNotifications.getNotification(
        kTestNotificationID,
        newWindow.gBrowser.selectedBrowser
      );
      Assert.ok(notification, "Should have gotten the notification");

      Assert.equal(
        notification.message,
        kTestMessage,
        "Should be showing the right message"
      );
      Assert.equal(
        notification.mainAction.label,
        mainAction.label,
        "The main action should have the right label"
      );
      Assert.equal(
        notification.mainAction.accessKey,
        mainAction.accessKey,
        "The main action should have the right access key"
      );
      Assert.equal(
        notification.secondaryActions.length,
        1,
        "There should only be 1 secondary action"
      );
      Assert.equal(
        notification.secondaryActions[0].label,
        secondaryAction.label,
        "The secondary action should have the right label"
      );
      Assert.equal(
        notification.secondaryActions[0].accessKey,
        secondaryAction.accessKey,
        "The secondary action should have the right access key"
      );
      Assert.ok(
        notification.options.displayURI.equals(mockRequest.principal.URI),
        "Should be showing the URI of the requesting page"
      );

      await BrowserTestUtils.closeWindow(newWindow);
    }
  );
});
