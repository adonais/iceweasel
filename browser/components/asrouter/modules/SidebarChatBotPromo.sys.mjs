/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ASRouter: "resource:///modules/asrouter/ASRouter.sys.mjs",
  RemoteL10n: "resource:///modules/asrouter/RemoteL10n.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

const PROMO_LISTENERS = new WeakMap();
const SIDEBAR_LOAD_TIMEOUT_MS = 5000;

export const SIDEBAR_CHATBOT_PROMO_EVENTS = Object.freeze({
  PRIMARY: "ChatbotPromo:PrimaryAction",
  CLOSE: "ChatbotPromo:Close",
  IMPRESSION: "ChatbotPromo:Impression",
});

export const SidebarChatBotPromo = {
  /**
   * Locate the promo element in the genai chat sidebar. The trigger passes the
   * selected tab's browser, but the promo lives in the sidebar panel browser's
   * document, so hop through SidebarController.
   *
   * `sidebarToolOpened` fires without awaiting `SidebarController.toggle()`, so
   * the panel is often still showing its previous document when we get here.
   * Wait one load cycle rather than silently dropping the message.
   *
   * @param {object} browser The browser the trigger fired for
   * @param {boolean} force When true (devtools "Show" / about:messagepreview),
   *   open the chat sidebar to the correct tool so the promo has somewhere to
   *   render, instead of relying on it already being open.
   * @returns {Promise<Element|null>} The chatbot-promo element, or null if not
   *   present before the panel finished loading
   */
  async getPromoElement(browser, force) {
    const win =
      browser?.browsingContext?.topChromeWindow ?? browser?.ownerGlobal;
    if (force) {
      await win?.SidebarController?.show?.("viewGenaiChatSidebar");
    }
    const sidebarBrowser = win?.SidebarController?.browser;
    if (!sidebarBrowser) {
      return null;
    }

    const findPromo = () =>
      sidebarBrowser.contentDocument?.getElementById("chatbot-promo") ?? null;

    const existing = findPromo();
    if (existing) {
      return existing;
    }

    await new Promise(resolve => {
      let timer;
      const onLoad = () => {
        win.clearTimeout(timer);
        sidebarBrowser.removeEventListener("load", onLoad, true);
        resolve();
      };
      timer = win.setTimeout(() => {
        sidebarBrowser.removeEventListener("load", onLoad, true);
        resolve();
      }, SIDEBAR_LOAD_TIMEOUT_MS);
      sidebarBrowser.addEventListener("load", onLoad, true);
    });

    return findPromo();
  },

  async showPromo(browser, message, force) {
    // Don't show during onboarding, before a chatbot is selected. Targeting
    // covers this for real messages, but test providers override targeting, so
    // guard here too and avoid counting impressions the user can't see.
    if (!Services.prefs.getStringPref("browser.ml.chat.provider", "")) {
      return;
    }

    const promo = await this.getPromoElement(browser, force);
    if (!promo || !message?.id) {
      return;
    }

    const content = message.content ?? {};
    const primaryButton = content.primary_button ?? {};
    // Use `additional_button`, not `secondary_button`: the onboarding provider
    // pre-translates `secondary_button` labels via Fluent, which breaks on
    // labels that aren't `{ string_id }`.
    const additionalButton = content.additional_button ?? {};

    const promoContent = {
      type: content.type,
      heading: await this.resolveText(content.heading),
      message: await this.resolveText(content.message),
      primaryActionText: await this.resolveText(primaryButton.label),
      additionalActionText: await this.resolveText(additionalButton.label),
    };

    if (
      !promoContent.heading &&
      !promoContent.message &&
      !promoContent.primaryActionText &&
      !promoContent.additionalActionText
    ) {
      return;
    }

    this.detachListeners(promo);

    const ac = new AbortController();
    const { signal } = ac;

    promo.addEventListener(
      SIDEBAR_CHATBOT_PROMO_EVENTS.IMPRESSION,
      () => {
        lazy.ASRouter.addImpression(lazy.ASRouter.getMessageById(message.id));
        this.recordTelemetry("IMPRESSION", message.id);
      },
      { signal, once: true }
    );

    promo.addEventListener(
      SIDEBAR_CHATBOT_PROMO_EVENTS.PRIMARY,
      () => {
        this.recordTelemetry("CLICK", message.id);
        this.handleButtonAction(primaryButton, browser, promo);
      },
      { signal }
    );

    promo.addEventListener(
      SIDEBAR_CHATBOT_PROMO_EVENTS.CLOSE,
      () => {
        this.recordTelemetry("DISMISS", message.id);
        this.handleButtonAction(additionalButton, browser, promo);
      },
      { signal }
    );

    PROMO_LISTENERS.set(promo, ac);

    promo.message = promoContent;
    promo.ownerDocument.getElementById("footer")?.classList.add("promo-active");
  },

  hide(promo) {
    if (!promo) {
      return;
    }
    this.detachListeners(promo);
    promo.message = null;
    promo.ownerDocument
      .getElementById("footer")
      ?.classList.remove("promo-active");
  },

  handleButtonAction(button, browser, promo) {
    if (button.action) {
      lazy.SpecialMessageActions.handleAction(button.action, browser);
    }
    this.hide(promo);
  },

  recordTelemetry(event, messageId) {
    lazy.ASRouter.dispatchCFRAction({
      type: "SIDEBAR_CHATBOT_PROMO_TELEMETRY",
      data: {
        action: "sidebar_chatbot_promo_user_event",
        message_id: messageId,
        event,
      },
    });
  },

  detachListeners(promo) {
    const ac = PROMO_LISTENERS.get(promo);
    if (ac) {
      ac.abort();
      PROMO_LISTENERS.delete(promo);
    }
  },

  async resolveText(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    return lazy.RemoteL10n.formatLocalizableText(value);
  },
};
