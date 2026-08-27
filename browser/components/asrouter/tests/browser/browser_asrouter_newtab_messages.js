/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AboutWelcomeTelemetry } = ChromeUtils.importESModule(
  "resource:///modules/aboutwelcome/AboutWelcomeTelemetry.sys.mjs"
);

const { PanelTestProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/PanelTestProvider.sys.mjs"
);

const { SpecialMessageActions } = ChromeUtils.importESModule(
  "resource://messaging-system/lib/SpecialMessageActions.sys.mjs"
);

const TEST_MESSAGE_ID = "TEST_ASROUTER_NEWTAB_MESSAGE";
let gTestNewTabMessage;

const TEST_POLLING_MESSAGE_ID = "TEST_ASROUTER_NEWTAB_MESSAGE_POLL_DEFAULT";
let gTestPollingNewTabMessage;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.newtabpage.activity-stream.telemetry", true],
      ["browser.newtab.preload", false],
    ],
  });
  NewTabPagePreloading.removePreloadedBrowser(window);

  Services.fog.testResetFOG();
  registerCleanupFunction(async () => {
    Services.fog.testResetFOG();
    await ASRouter.resetMessageState();
  });

  gTestNewTabMessage = await PanelTestProvider.getMessages().then(msgs =>
    msgs.find(msg => msg.id === TEST_MESSAGE_ID)
  );
  Assert.ok(gTestNewTabMessage, "Found a test fxa_cta message to use.");

  /**
   * @backward-compat { version 155 }
   *
   * This test message was added to PanelTestProvider in version 155. This test,
   * however, runs in the newtab train-hop CI jobs, which means that we have
   * to shim the test message until the PanelTestProvider change reaches 155.
   */
  if (Services.vc.compare(AppConstants.MOZ_APP_VERSION, "155.0a1") < 0) {
    gTestPollingNewTabMessage = {
      id: "TEST_ASROUTER_NEWTAB_MESSAGE_POLL_DEFAULT",
      template: "newtab_message",
      content: {
        messageType: "ASRouterNewTabMessage",
        imageSrc:
          // eslint-disable-next-line mozilla/no-newtab-refs-outside-newtab
          "chrome://newtab/content/data/content/assets/kit-in-circle.svg",
        heading: "Make Firefox your own",
        body: "Set Firefox as your default browser and pin it so it's always a click away.",
        hideDismissButton: false,
        // Declarative variants: each entry's `targeting` is re-evaluated against
        // the live ASRouter environment (the "uncached" attributes read live
        // shell state), and the first match's content overlays the base content.
        // A `final` entry stops the re-evaluation poll once reached. Here, each
        // state drops whichever step is already satisfied, so only the still-
        // relevant button(s) show: both when neither is done (base content), only
        // "Pin to taskbar" once we're the default, only "Set as default" once
        // we're pinned, and the completed state once both are true.
        states: [
          {
            // Already the default but not pinned: drop the "Set as default" step
            // and only ask to pin.
            targeting: "isDefaultBrowserUncached && doesAppNeedPinUncached",
            content: {
              primaryButton: null,
            },
          },
          {
            // Already pinned but not the default: drop the "Pin to taskbar" step
            // and only ask to set as default.
            targeting: "!isDefaultBrowserUncached && !doesAppNeedPinUncached",
            content: {
              secondaryButton: null,
            },
          },
          {
            // Default and pinned: everything's done. Show the completed state
            // and stop polling.
            targeting: "isDefaultBrowserUncached && !doesAppNeedPinUncached",
            final: true,
            content: {
              heading: "You're all set",
              body: "Firefox is now your default browser and pinned. Thanks!",
              // No `type`, so this renders in the primary style.
              primaryButton: {
                label: "Go to settings to try it out!",
                action: {
                  type: "OPEN_ABOUT_PAGE",
                  data: { args: "settings#browserIcon", where: "tab" },
                },
              },
              secondaryButton: null,
            },
          },
        ],
        // The base content (neither step done) shows both steps, rendered non-
        // primary (`type: "default"`) since neither is the single call-to-action.
        // The states above swap in narrower content as each step is satisfied.
        primaryButton: {
          label: "Set as default",
          type: "default",
          action: {
            type: "SET_DEFAULT_BROWSER",
          },
        },
        secondaryButton: {
          label: "Pin to taskbar",
          type: "default",
          action: {
            type: "PIN_FIREFOX_TO_TASKBAR",
          },
        },
        position: "ABOVE_TOPSITES",
      },
      frequency: {
        lifetime: 3,
      },
      trigger: {
        id: "newtabMessageCheck",
      },
      targeting: "true",
      groups: ["cfr"],
    };
  } else {
    gTestPollingNewTabMessage = await PanelTestProvider.getMessages().then(
      msgs => msgs.find(msg => msg.id === TEST_POLLING_MESSAGE_ID)
    );
  }
  Assert.ok(
    gTestPollingNewTabMessage,
    "Found a test polling newtab message to use."
  );
});

/**
 * Tests that registering our test message results it in appearing on newtab,
 * and that we record an impression for it.
 */
add_task(async function test_show_newtab_message() {
  let sandbox = sinon.createSandbox();
  sandbox.spy(ASRouter, "addImpression");
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");

    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Waiting for asrouter-newtab-message");
    });
  });

  await TestUtils.waitForCondition(
    () => ASRouter.addImpression.calledWith(gTestNewTabMessage),
    "The test message had an impression recorded for it."
  );
  await TestUtils.waitForCondition(
    () =>
      AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
        sinon.match({
          message_id: gTestNewTabMessage.id,
          event: "IMPRESSION",
          pingType: "newtab_message",
        })
      ),
    "Waiting for Glean IMPRESSION ping"
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the message has callbacks assigned to it that allow it to
 * be blocked.
 */
add_task(async function test_block_newtab_message() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(ASRouter, "blockMessageById").returns(Promise.resolve());

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      // Eventually, if this UI component has a block button that exists in
      // every variant it displays, or a common block behaviour, we can trigger
      // that here. For now though, we'll just call the handleBlock method
      // manually.
      Cu.waiveXrays(msgEl).handleBlock();
    });
  });

  Assert.ok(
    ASRouter.blockMessageById.calledWith(TEST_MESSAGE_ID),
    "The test message was blocked."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the message has callbacks assigned to it that allow it to
 * be closed without being considered dismissed. This just removes the message
 * from the DOM.
 */
add_task(async function test_close_newtab_message() {
  let sandbox = sinon.createSandbox();
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      // Eventually, if this UI component has a block button that exists in
      // every variant it displays, or a common block behaviour, we can trigger
      // that here. For now though, we'll just call the handleClose method
      // manually.
      Cu.waiveXrays(msgEl).handleClose();

      await ContentTaskUtils.waitForCondition(() => {
        return !content.document.querySelector("asrouter-newtab-message");
      }, "asrouter-newtab-message removed from DOM");
    });
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the message has callbacks assigned to it that allow it to
 * be dismissed, which is then recorded in telemetry. This is a superset of
 * the "close" action, which also removes the message from the DOM.
 */
add_task(async function test_dismiss_newtab_message() {
  let sandbox = sinon.createSandbox();
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      // Eventually, if this UI component has a block button that exists in
      // every variant it displays, or a common block behaviour, we can trigger
      // that here. For now though, we'll just call the handleDismiss method
      // manually.
      Cu.waiveXrays(msgEl).handleDismiss();

      // This should also remove the asrouter-newtab-message from the DOM, since
      // handleDismiss automatically calls handleClose.
      await ContentTaskUtils.waitForCondition(() => {
        return !content.document.querySelector("asrouter-newtab-message");
      }, "asrouter-newtab-message removed from DOM");
    });
  });

  Assert.ok(
    AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
      sinon.match({
        message_id: gTestNewTabMessage.id,
        event: "DISMISS",
        pingType: "newtab_message",
      })
    ),
    "The test message had a dismiss recorded for it."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the message has callbacks assigned to it that allow it to record
 * a click telemetry event that we expect for newtab messages.
 */
add_task(async function test_click_newtab_message() {
  let sandbox = sinon.createSandbox();
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      // Eventually, if this UI component has a block button that exists in
      // every variant it displays, or a common block behaviour, we can trigger
      // that here. For now though, we'll just call the handleClick method
      // manually.
      Cu.waiveXrays(msgEl).handleClick();
    });
  });

  Assert.ok(
    AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
      sinon.match({
        message_id: gTestNewTabMessage.id,
        event: "CLICK",
        pingType: "newtab_message",
      })
    ),
    "The test message had a click recorded for it."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the asrouter-newtab-message component can be used to trigger
 * special message actions.
 */
add_task(async function test_special_message_actions() {
  let sandbox = sinon.createSandbox();
  const TEST_ACTION = { type: "TEST_ACTION", data: { test: 123 } };

  sandbox.stub(SpecialMessageActions, "handleAction");

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [TEST_ACTION],
      async action => {
        await ContentTaskUtils.waitForCondition(() => {
          return content.document.querySelector("asrouter-newtab-message");
        }, "Found asrouter-newtab-message");

        let msgEl = content.document.querySelector("asrouter-newtab-message");
        Cu.waiveXrays(msgEl).specialMessageAction(
          Cu.cloneInto(action, content)
        );
      }
    );
  });

  Assert.ok(
    SpecialMessageActions.handleAction.calledWithMatch(
      sinon.match(TEST_ACTION),
      gBrowser.selectedBrowser
    ),
    "SpecialMessageActions was callable from the asrouter-newtab-message component."
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that clicking the X button in the component's shadow DOM permanently
 * blocks the message and records a DISMISS telemetry event.
 */
add_task(async function test_dismiss_button_click() {
  let sandbox = sinon.createSandbox();
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");
  sandbox.stub(ASRouter, "blockMessageById").returns(Promise.resolve());

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let dismissBtn = shadow.querySelector(".dismiss-button moz-button");
      Assert.ok(dismissBtn, "Found dismiss button in shadow DOM");
      dismissBtn.click();

      await ContentTaskUtils.waitForCondition(() => {
        return !content.document.querySelector("asrouter-newtab-message");
      }, "asrouter-newtab-message removed from DOM");
    });
  });

  Assert.ok(
    ASRouter.blockMessageById.calledWith(TEST_MESSAGE_ID),
    "Clicking the X button permanently blocked the message."
  );
  Assert.ok(
    AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
      sinon.match({
        message_id: gTestNewTabMessage.id,
        event: "DISMISS",
        pingType: "newtab_message",
      })
    ),
    "Clicking the X button recorded a DISMISS telemetry event."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that clicking the primary button fires click telemetry and triggers the
 * configured SpecialMessageAction.
 */
add_task(async function test_primary_button_click() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(SpecialMessageActions, "handleAction");
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let primaryBtn = shadow.querySelector(
        ".button-group moz-button[type='primary']"
      );
      Assert.ok(primaryBtn, "Found primary button in shadow DOM");
      primaryBtn.click();
    });
  });

  Assert.ok(
    SpecialMessageActions.handleAction.calledWithMatch(
      sinon.match({
        type: "OPEN_URL",
        data: { args: "https://www.mozilla.org/" },
      }),
      gBrowser.selectedBrowser
    ),
    "Clicking the primary button triggered the configured SpecialMessageAction."
  );
  Assert.ok(
    AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
      sinon.match({
        message_id: gTestNewTabMessage.id,
        event: "CLICK",
        pingType: "newtab_message",
      })
    ),
    "Clicking the primary button recorded a CLICK telemetry event."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that a button's moz-button `type` can be overridden from content, so a
 * message can render its primary button non-primary (and its secondary button
 * primary).
 */
add_task(async function test_button_type_override() {
  let sandbox = sinon.createSandbox();

  const testMessage = {
    ...gTestNewTabMessage,
    content: {
      ...gTestNewTabMessage.content,
      primaryButton: {
        label: "Not emphasized",
        type: "default",
        action: { type: "CANCEL" },
      },
      secondaryButton: {
        label: "Emphasized",
        type: "primary",
        action: { type: "CANCEL" },
      },
    },
  };

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;

      let primaryBtn = shadow.querySelector(
        ".button-group moz-button[type='default']"
      );
      Assert.ok(
        primaryBtn,
        "Primary button honored its overridden type='default'."
      );
      Assert.equal(
        primaryBtn.textContent.trim(),
        "Not emphasized",
        "The default-styled button is the primary button."
      );

      let secondaryBtn = shadow.querySelector(
        ".button-group moz-button[type='primary']"
      );
      Assert.ok(
        secondaryBtn,
        "Secondary button honored its overridden type='primary'."
      );
      Assert.equal(
        secondaryBtn.textContent.trim(),
        "Emphasized",
        "The primary-styled button is the secondary button."
      );
    });
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

add_task(async function test_hidden_dismiss_button() {
  let sandbox = sinon.createSandbox();
  const testMessage = {
    ...gTestNewTabMessage,
    content: {
      ...gTestNewTabMessage.content,
      hideDismissButton: true,
    },
  };

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let dismissBtn = shadow.querySelector(".dismiss-button moz-button");
      Assert.ok(
        !dismissBtn,
        "Dismiss button is not rendered when hideDismissButton is true"
      );
    });
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that clicking the secondary button fires CLICK telemetry and triggers
 * the configured SpecialMessageAction.
 */
add_task(async function test_secondary_button_click() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(SpecialMessageActions, "handleAction");
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");

  const testMessage = {
    ...gTestNewTabMessage,
    content: {
      ...gTestNewTabMessage.content,
      secondaryButton: {
        label: "Secondary Action",
        action: { type: "CANCEL" },
      },
    },
  };

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let secondaryBtn = shadow.querySelector(
        ".button-group moz-button[type='default']"
      );
      Assert.ok(secondaryBtn, "Found secondary button in shadow DOM");
      secondaryBtn.click();
    });
  });

  Assert.ok(
    SpecialMessageActions.handleAction.calledWithMatch(
      sinon.match({ type: "CANCEL" }),
      gBrowser.selectedBrowser
    ),
    "Clicking the secondary button triggered the configured SpecialMessageAction."
  );
  Assert.ok(
    AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
      sinon.match({
        message_id: testMessage.id,
        event: "CLICK",
        pingType: "newtab_message",
      })
    ),
    "Clicking the secondary button recorded a CLICK telemetry event."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

add_task(async function test_secondary_button_dismiss() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(SpecialMessageActions, "handleAction");
  sandbox.spy(AboutWelcomeTelemetry.prototype, "submitGleanPingForPing");
  sandbox.spy(ASRouter, "blockMessageById");

  const testMessage = {
    ...gTestNewTabMessage,
    content: {
      ...gTestNewTabMessage.content,
      secondaryButton: {
        label: "Not Now",
        action: {
          dismiss: true,
        },
      },
    },
  };

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let secondaryBtn = shadow.querySelector(
        ".button-group moz-button[type='default']"
      );
      Assert.ok(secondaryBtn, "Found secondary button in shadow DOM");
      secondaryBtn.click();

      await ContentTaskUtils.waitForCondition(() => {
        return !content.document.querySelector("asrouter-newtab-message");
      }, "asrouter-newtab-message removed from DOM after dismiss");
    });
  });

  Assert.ok(
    !SpecialMessageActions.handleAction.called,
    "Clicking the secondary button with only dismiss: true did not trigger SpecialMessageActions."
  );
  Assert.ok(
    !ASRouter.blockMessageById.called,
    "Clicking the secondary button with dismiss: true did not permanently block the message."
  );
  Assert.ok(
    AboutWelcomeTelemetry.prototype.submitGleanPingForPing.calledWithMatch(
      sinon.match({
        message_id: testMessage.id,
        event: "DISMISS",
        pingType: "newtab_message",
      })
    ),
    "Clicking the secondary button with dismiss: true recorded a DISMISS telemetry event."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that clicking the secondary button with a BLOCK_MESSAGE action
 * permanently blocks the message via SpecialMessageActions.
 */
add_task(async function test_secondary_button_block_message() {
  let sandbox = sinon.createSandbox();
  sandbox
    .stub(SpecialMessageActions, "blockMessageById")
    .returns(Promise.resolve());

  const testMessage = {
    ...gTestNewTabMessage,
    content: {
      ...gTestNewTabMessage.content,
      secondaryButton: {
        label: "No Thanks",
        action: {
          type: "BLOCK_MESSAGE",
          data: { id: TEST_MESSAGE_ID },
        },
      },
    },
  };

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let secondaryBtn = shadow.querySelector(
        ".button-group moz-button[type='default']"
      );
      Assert.ok(secondaryBtn, "Found secondary button in shadow DOM");
      secondaryBtn.click();
    });
  });

  await TestUtils.waitForCondition(
    () => SpecialMessageActions.blockMessageById.calledWith(TEST_MESSAGE_ID),
    "Clicking the secondary button with BLOCK_MESSAGE permanently blocked the message."
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the image property, when set to the empty string, causes the image
 * element to not be rendered.
 */
add_task(async function test_image_is_optional() {
  let sandbox = sinon.createSandbox();

  await withTestMessage(sandbox, gTestNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [gTestNewTabMessage.content.imageSrc],
      async imageURL => {
        await ContentTaskUtils.waitForCondition(() => {
          return content.document.querySelector("asrouter-newtab-message");
        }, "Found asrouter-newtab-message");

        let msgEl = content.document.querySelector("asrouter-newtab-message");
        let shadow = Cu.waiveXrays(msgEl).shadowRoot;
        let image = shadow.querySelector("img");
        Assert.ok(image, "Found image in shadow DOM");
        Assert.ok(ContentTaskUtils.isVisible(image), "Image is visible");
        Assert.equal(
          image.src,
          imageURL,
          "Image source was set to the right URL"
        );
      }
    );
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });

  const testMessageNoImage = {
    ...gTestNewTabMessage,
    content: {
      ...gTestNewTabMessage.content,
      imageSrc: "",
    },
  };

  await withTestMessage(sandbox, testMessageNoImage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let image = shadow.querySelector("img");
      Assert.ok(!image, "No image in shadow DOM");
    });
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  });

  sandbox.restore();
});

/**
 * Tests that a message with declarative `content.states` re-evaluates each
 * state's targeting against the live environment and recomposes into the first
 * matching state's content - here, the completed state once Firefox is both
 * default and pinned.
 */
add_task(async function test_states_targeting_recompose() {
  let sandbox = sinon.createSandbox();

  // Start out neither default nor pinned. The state targeting uses the
  // "uncached" attributes, which read these live.
  let isDefaultStub = sandbox.stub(ShellService, "isDefaultBrowser");
  isDefaultStub.returns(false);
  let needsPinStub = sandbox.stub(ShellService, "doesAppNeedPin");
  needsPinStub.resolves(true);

  let targetings = gTestPollingNewTabMessage.content.states.map(
    state => state.targeting
  );

  await withTestMessage(sandbox, gTestPollingNewTabMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(gBrowser.selectedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => {
        return content.document.querySelector("asrouter-newtab-message");
      }, "Found asrouter-newtab-message");

      let msgEl = content.document.querySelector("asrouter-newtab-message");
      let shadow = Cu.waiveXrays(msgEl).shadowRoot;
      let heading = shadow.querySelector("#asrouter-newtab-message-heading");
      Assert.equal(
        heading.textContent,
        "Make Firefox your own",
        "Base content is shown while not default/pinned."
      );

      // Both steps render as non-primary buttons: the content-specified
      // `type: "default"` is honored, and there is no primary button.
      let buttons = shadow.querySelectorAll(".button-group moz-button");
      Assert.equal(buttons.length, 2, "Base state renders two buttons.");
      Assert.equal(
        shadow.querySelectorAll(".button-group moz-button[type='default']")
          .length,
        2,
        "Both base-state buttons are non-primary (type='default')."
      );
      Assert.ok(
        !shadow.querySelector(".button-group moz-button[type='primary']"),
        "Base state renders no primary button."
      );
    });

    // Become default and pinned, then trigger a re-evaluation.
    isDefaultStub.returns(true);
    needsPinStub.resolves(false);

    await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [targetings],
      async targetingExpressions => {
        let msgEl = content.document.querySelector("asrouter-newtab-message");
        // Dispatch the evaluate event directly to exercise the actor -> parent
        // -> setMatchedState path without relying on the visibility-gated poll
        // timing.
        msgEl.dispatchEvent(
          new content.CustomEvent("ASRouterNewTabMessage:EvaluateTargeting", {
            bubbles: true,
            detail: { targetings: targetingExpressions },
          })
        );

        let shadow = Cu.waiveXrays(msgEl).shadowRoot;
        await ContentTaskUtils.waitForCondition(() => {
          let heading = shadow.querySelector(
            "#asrouter-newtab-message-heading"
          );
          return heading?.textContent === "You're all set";
        }, "Message recomposed into the completed state once default and pinned.");

        // The completed state's button sets no `type`, so it defaults to the
        // primary style.
        Assert.equal(
          shadow.querySelectorAll(".button-group moz-button").length,
          1,
          "Completed state renders a single button."
        );
        Assert.ok(
          shadow.querySelector(".button-group moz-button[type='primary']"),
          "Completed-state button renders in the primary style."
        );
      }
    );
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that when more than one `content.states` entry matches, the first
 * matching entry (in declaration order) is the one that gets applied.
 */
add_task(async function test_states_first_match_wins() {
  let sandbox = sinon.createSandbox();

  const testMessage = {
    ...gTestNewTabMessage,
    targeting: "true",
    content: {
      ...gTestNewTabMessage.content,
      states: [
        { targeting: "true", content: { heading: "First match" } },
        { targeting: "true", content: { heading: "Second match" } },
      ],
    },
  };
  let targetings = testMessage.content.states.map(state => state.targeting);

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [targetings],
      async targetingExpressions => {
        await ContentTaskUtils.waitForCondition(() => {
          return content.document.querySelector("asrouter-newtab-message");
        }, "Found asrouter-newtab-message");

        let msgEl = content.document.querySelector("asrouter-newtab-message");
        // Both states match; dispatch the evaluate event directly so we don't
        // depend on the visibility-gated poll timing.
        msgEl.dispatchEvent(
          new content.CustomEvent("ASRouterNewTabMessage:EvaluateTargeting", {
            bubbles: true,
            detail: { targetings: targetingExpressions },
          })
        );

        let shadow = Cu.waiveXrays(msgEl).shadowRoot;
        await ContentTaskUtils.waitForCondition(() => {
          let heading = shadow.querySelector(
            "#asrouter-newtab-message-heading"
          );
          return heading?.textContent === "First match";
        }, "The first matching state wins when several match.");
      }
    );
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});

/**
 * Tests that the intermediate `content.states` drop whichever step is already
 * satisfied: only "Pin to taskbar" shows once Firefox is the default, and only
 * "Set as default" shows once Firefox is pinned.
 */
add_task(async function test_states_partial_progress() {
  let sandbox = sinon.createSandbox();

  let isDefaultStub = sandbox.stub(ShellService, "isDefaultBrowser");
  let needsPinStub = sandbox.stub(ShellService, "doesAppNeedPin");

  let targetings = gTestPollingNewTabMessage.content.states.map(
    state => state.targeting
  );

  async function assertSingleButton(expectedLabel, message) {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [targetings, expectedLabel, message],
      async (targetingExpressions, label, description) => {
        await ContentTaskUtils.waitForCondition(() => {
          return content.document.querySelector("asrouter-newtab-message");
        }, "Found asrouter-newtab-message");

        let msgEl = content.document.querySelector("asrouter-newtab-message");
        // Dispatch the evaluate event directly so we don't depend on the
        // visibility-gated poll timing.
        msgEl.dispatchEvent(
          new content.CustomEvent("ASRouterNewTabMessage:EvaluateTargeting", {
            bubbles: true,
            detail: { targetings: targetingExpressions },
          })
        );

        let shadow = Cu.waiveXrays(msgEl).shadowRoot;
        await ContentTaskUtils.waitForCondition(() => {
          let buttons = shadow.querySelectorAll(".button-group moz-button");
          return (
            buttons.length === 1 && buttons[0].textContent.trim() === label
          );
        }, description);
      }
    );
    BrowserTestUtils.removeTab(gBrowser.selectedTab);
  }

  // Already the default, but still needs pinning: only "Pin to taskbar" shows.
  isDefaultStub.returns(true);
  needsPinStub.resolves(true);
  await withTestMessage(sandbox, gTestPollingNewTabMessage, async () => {
    await assertSingleButton(
      "Pin to taskbar",
      "Only the Pin to taskbar step shows once Firefox is the default."
    );
  });

  // Already pinned, but not the default: only "Set as default" shows.
  isDefaultStub.returns(false);
  needsPinStub.resolves(false);
  await withTestMessage(sandbox, gTestPollingNewTabMessage, async () => {
    await assertSingleButton(
      "Set as default",
      "Only the Set as default step shows once Firefox is pinned."
    );
  });

  sandbox.restore();
});

/**
 * Tests that a state whose `targeting` fails to evaluate is treated as
 * non-matching (fails closed) rather than matching, so a broken expression
 * can't lock the message into the wrong state.
 */
add_task(async function test_states_targeting_fails_closed() {
  let sandbox = sinon.createSandbox();

  const testMessage = {
    ...gTestNewTabMessage,
    targeting: "true",
    content: {
      ...gTestNewTabMessage.content,
      heading: "Base heading",
      states: [
        {
          // An unknown JEXL transform throws during evaluation.
          targeting: "'x'|thisTransformDoesNotExist",
          content: { heading: "Errored state" },
        },
        {
          targeting: "true",
          content: { heading: "Matched state" },
        },
      ],
    },
  };
  let targetings = testMessage.content.states.map(state => state.targeting);

  await withTestMessage(sandbox, testMessage, async () => {
    await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:newtab");
    await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [targetings],
      async targetingExpressions => {
        await ContentTaskUtils.waitForCondition(() => {
          return content.document.querySelector("asrouter-newtab-message");
        }, "Found asrouter-newtab-message");

        let msgEl = content.document.querySelector("asrouter-newtab-message");
        msgEl.dispatchEvent(
          new content.CustomEvent("ASRouterNewTabMessage:EvaluateTargeting", {
            bubbles: true,
            detail: { targetings: targetingExpressions },
          })
        );

        let shadow = Cu.waiveXrays(msgEl).shadowRoot;
        await ContentTaskUtils.waitForCondition(() => {
          let heading = shadow.querySelector(
            "#asrouter-newtab-message-heading"
          );
          return heading?.textContent === "Matched state";
        }, "The erroring state was skipped and the later matching state won.");
      }
    );
  });

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
  sandbox.restore();
});
