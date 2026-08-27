/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Determines whether a given value is a fluent id or plain text and adds it to an element
 *
 * @param {Array<[HTMLElement, string]>} items An array of [element, value] where value is
 *                                       a fluent id starting with "fluent:" or plain text
 */
function translateElements(items) {
  items.forEach(([element, value]) => {
    // Skip empty text or elements
    if (!element || !value) {
      return;
    }
    const fluentId = value.replace(/^fluent:/, "");
    if (fluentId !== value) {
      document.l10n.setAttributes(element, fluentId);
    } else {
      element.textContent = value;
      element.removeAttribute("data-l10n-id");
    }
  });
}

async function renderPromo({
  messageId = null,
  promoEnabled = false,
  promoType = "VPN",
  promoTitle,
  promoTitleEnabled,
  promoLinkText,
  promoLinkType,
  promoSectionStyle,
  promoHeader,
  promoImageLarge,
  promoImageSmall,
  promoButton = null,
} = {}) {
  const shouldShowPromo = await RPMSendQuery("ShouldShowPromo", {
    type: promoType,
  });
  const novaEnabled = RPMGetBoolPref("browser.nova.enabled", false);
  const legacyContainer = document.querySelector(".promo");
  const novaContainer = document.querySelector(".nova-promo-wrapper");

  // Only one promo layout is ever shown; drop the inactive subtree so that the
  // rest of the page (CSS, preload checks, telemetry) only sees the active one.
  (novaEnabled ? legacyContainer : novaContainer)?.remove();
  const container = novaEnabled ? novaContainer : legacyContainer;

  if (!promoEnabled || !shouldShowPromo) {
    container.remove();
    return false;
  }

  const onLinkClick = async event => {
    event.preventDefault();

    // Record promo click telemetry and set metrics as allow for spotlight
    // modal opened on promo click if user is enrolled in an experiment
    let isExperiment = window.PrivateBrowsingRecordClick("PromoLink");
    const promoButtonData = promoButton?.action?.data;
    if (
      promoButton?.action?.type === "SHOW_SPOTLIGHT" &&
      promoButtonData?.content
    ) {
      promoButtonData.content.metrics = isExperiment ? "allow" : "block";
    }

    await RPMSendQuery("SpecialMessageActionDispatch", promoButton.action);
  };

  const onDismiss = () => {
    window.ASRouterMessage({
      type: "BLOCK_MESSAGE_BY_ID",
      data: { id: messageId },
    });
    window.PrivateBrowsingRecordClick("DismissButton");
    container.remove();
  };

  if (!novaEnabled && messageId) {
    container
      .querySelector(".promo-dismiss")
      ?.addEventListener("click", onDismiss, { once: true });
  }

  // Without an action the promo link does nothing, so don't show the promo.
  if (!promoButton?.action) {
    container.remove();
    return false;
  }

  if (novaEnabled) {
    await renderNovaPromo({
      container,
      promoTitle,
      promoTitleEnabled,
      promoLinkText,
      promoLinkType,
      promoHeader,
      promoImageLarge,
      onLinkClick,
      onDismiss,
      dismissable: !!messageId,
    });
  } else {
    renderLegacyPromo({
      container,
      promoTitle,
      promoTitleEnabled,
      promoLinkText,
      promoLinkType,
      promoSectionStyle,
      promoHeader,
      promoImageLarge,
      promoImageSmall,
      onLinkClick,
    });
  }

  return true;
}

/**
 * Resolves a promo text value to a plain string. Values may either be a
 * "fluent:"-prefixed localization id or already-localized plain text.
 *
 * A missing Fluent message resolves to an empty string rather than throwing,
 * matching the legacy layout (which uses data-l10n-id and simply renders
 * nothing for a missing message). Throwing here would abort promo rendering
 * before the call-to-action click handler is attached.
 *
 * @param {string} value The "fluent:"-prefixed id or plain text.
 * @returns {Promise<string>} The localized string.
 */
async function resolvePromoText(value) {
  if (!value) {
    return "";
  }
  const fluentId = value.replace(/^fluent:/, "");
  if (fluentId !== value) {
    try {
      return (await document.l10n.formatValue(fluentId)) ?? "";
    } catch (e) {
      // formatValue throws for a missing message under automation; fall back to
      // empty text so the promo still renders and stays interactive.
      console.error(e);
      return "";
    }
  }
  return value;
}

/**
 * Populates and reveals the Nova <moz-promo> layout. Regardless of the
 * promoSectionStyle requested by the message, the Nova promo is always shown
 * below the search box so the Nova design is used consistently.
 *
 * The message's promoLinkType decides which call to action is shown: a link
 * for navigational actions and a button otherwise. The unused element is
 * removed so its slot stays empty.
 */
async function renderNovaPromo({
  container,
  promoTitle,
  promoTitleEnabled,
  promoLinkText,
  promoLinkType,
  promoHeader,
  promoImageLarge,
  onLinkClick,
  onDismiss,
  dismissable,
}) {
  const promoEl = container.querySelector("#nova-promo");
  const linkEl = container.querySelector("#nova-promo-link");
  const buttonEl = container.querySelector("#nova-promo-button");

  // moz-promo (and the moz-button it slots) is loaded as a deferred module, so
  // it may not be upgraded yet. Wait for it before setting reactive properties.
  await customElements.whenDefined("moz-promo");
  await customElements.whenDefined("moz-button");

  promoEl.dismissable = dismissable;
  if (dismissable) {
    promoEl.addEventListener(
      "promo:user-dismissed",
      event => {
        event.preventDefault();
        onDismiss();
      },
      { once: true }
    );
  }

  if (promoHeader) {
    promoEl.heading = await resolvePromoText(promoHeader);
  }
  if (promoTitleEnabled) {
    promoEl.message = await resolvePromoText(promoTitle);
  }
  if (promoImageLarge) {
    promoEl.imageSrc = promoImageLarge;
  }

  const ctaText = await resolvePromoText(promoLinkText);
  const useButton = promoLinkType === "button";
  const ctaEl = useButton ? buttonEl : linkEl;
  (useButton ? linkEl : buttonEl).remove();

  if (useButton) {
    ctaEl.label = ctaText;
  } else {
    ctaEl.textContent = ctaText;
  }
  ctaEl.addEventListener("click", onLinkClick);

  const infoBorderEl = document.querySelector(".info-border");
  infoBorderEl?.insertAdjacentElement("beforebegin", container);

  container.hidden = false;
}

/**
 * Populates and reveals the legacy promo layout.
 */
function renderLegacyPromo({
  container,
  promoTitle,
  promoTitleEnabled,
  promoLinkText,
  promoLinkType,
  promoSectionStyle,
  promoHeader,
  promoImageLarge,
  promoImageSmall,
  onLinkClick,
}) {
  const titleEl = document.getElementById("private-browsing-promo-text");
  const linkEl = document.getElementById("private-browsing-promo-link");
  const promoHeaderEl = document.getElementById("promo-header");
  const infoContainerEl = document.querySelector(".info");
  const promoImageLargeEl = document.querySelector(".promo-image-large img");
  const promoImageSmallEl = document.querySelector(".promo-image-small img");

  if (promoLinkType === "link") {
    linkEl.classList.remove("primary");
    linkEl.classList.add("text-link", "promo-link");
  }

  linkEl.addEventListener("click", onLinkClick);

  if (promoSectionStyle) {
    container.classList.add(promoSectionStyle);

    switch (promoSectionStyle) {
      case "below-search":
        container.remove();
        infoContainerEl?.insertAdjacentElement("beforebegin", container);
        break;
      case "top":
        container.remove();
        document.body.insertAdjacentElement("afterbegin", container);
    }
  }

  if (promoImageLarge) {
    promoImageLargeEl.src = promoImageLarge;
  } else {
    promoImageLargeEl.parentNode.remove();
  }

  if (promoImageSmall) {
    promoImageSmallEl.src = promoImageSmall;
  } else {
    promoImageSmallEl.parentNode.remove();
  }

  if (!promoTitleEnabled) {
    titleEl.remove();
  }

  if (!promoHeader) {
    promoHeaderEl.remove();
  }

  translateElements([
    [titleEl, promoTitle],
    [linkEl, promoLinkText],
    [promoHeaderEl, promoHeader],
  ]);

  // Only make promo section visible after adding content
  // and translations to prevent layout shifting in page
  container.classList.add("promo-visible");
  container.hidden = false;
  return true;
}

/**
 * For every PB newtab loaded, a second is pre-rendered in the background.
 * We need to guard against invalid impressions by checking visibility state.
 * If visible, record. Otherwise, listen for visibility change and record later.
 */
function recordOnceVisible(message) {
  const recordImpression = () => {
    if (document.visibilityState === "visible") {
      window.ASRouterMessage({
        type: "IMPRESSION",
        data: message,
      });
      // Similar telemetry, but for Nimbus experiments
      window.PrivateBrowsingPromoExposureTelemetry();
      document.removeEventListener("visibilitychange", recordImpression);
    }
  };

  if (document.visibilityState === "visible") {
    window.ASRouterMessage({
      type: "IMPRESSION",
      data: message,
    });
    // Similar telemetry, but for Nimbus experiments
    window.PrivateBrowsingPromoExposureTelemetry();
  } else {
    document.addEventListener("visibilitychange", recordImpression);
  }
}

// The PB newtab may be pre-rendered. Once the tab is visible, check to make sure the message wasn't blocked after the initial render. If it was, remove the promo.
function handlePromoOnPreload(message) {
  async function removePromoIfBlocked() {
    if (document.visibilityState === "visible") {
      let blocked = await RPMSendQuery("IsPromoBlocked", message);
      if (blocked) {
        const container = document.querySelector(".promo, .nova-promo-wrapper");
        container?.remove();
      }
    }
    document.removeEventListener("visibilitychange", removePromoIfBlocked);
  }
  // Only add the listener to pre-rendered tabs that aren't visible
  if (document.visibilityState !== "visible") {
    document.addEventListener("visibilitychange", removePromoIfBlocked);
  }
}

async function setupMessageConfig(config = null) {
  let message = null;

  if (!config) {
    let hideDefault = window.PrivateBrowsingShouldHideDefault();
    try {
      let response = await window.ASRouterMessage({
        type: "PBNEWTAB_MESSAGE_REQUEST",
        data: { hideDefault: !!hideDefault },
      });
      message = response?.message;
      config = message?.content;
      config.messageId = message?.id;
    } catch (e) {}
  }

  let hasRendered = await renderPromo(config);
  if (hasRendered && message) {
    recordOnceVisible(message);
    handlePromoOnPreload(message);
  }
  // For tests
  document.documentElement.setAttribute("PrivateBrowsingRenderComplete", true);
}

let SHOW_DEVTOOLS_MESSAGE = "ShowDevToolsMessage";

function showDevToolsMessage(msg) {
  msg.data.content.messageId = "DEVTOOLS_MESSAGE";
  setupMessageConfig(msg?.data?.content);
  RPMRemoveMessageListener(SHOW_DEVTOOLS_MESSAGE, showDevToolsMessage);
}

document.addEventListener("DOMContentLoaded", function () {
  // check the url to see if we're rendering a devtools message
  if (document.location.toString().includes("debug")) {
    RPMAddMessageListener(SHOW_DEVTOOLS_MESSAGE, showDevToolsMessage);
    return;
  }
  if (!RPMIsWindowPrivate()) {
    document.documentElement.classList.remove("private");
    document.documentElement.classList.add("normal");
    document
      .getElementById("startPrivateBrowsing")
      .addEventListener("click", function () {
        RPMSendAsyncMessage("OpenPrivateWindow");
      });
    return;
  }

  // The default info content is already in the markup, but we need to use JS to
  // set up the learn more link, since it's dynamically generated.
  const linkEl = document.getElementById("private-browsing-myths");
  linkEl.setAttribute(
    "href",
    RPMGetFormatURLPref("app.support.baseURL") + "private-browsing-myths"
  );
  linkEl.addEventListener("click", () => {
    window.PrivateBrowsingRecordClick("InfoLink");
  });

  if (RPMGetBoolPref("browser.nova.enabled", false)) {
    document.getElementById("info-title").hidden = true;
    document.l10n.setAttributes(
      document.getElementById("info-body"),
      "about-private-browsing-nova-info-body"
    );
    document.l10n.setAttributes(
      document.getElementById("private-browsing-myths"),
      "about-private-browsing-nova-info-link"
    );
  }

  // We don't do this setup until now, because we don't want to record any impressions until we're
  // sure we're actually running a private window, not just about:privatebrowsing in a normal window.
  setupMessageConfig();

  // Set up the private search banner.
  const privateSearchBanner = document.getElementById("search-banner");

  RPMSendQuery("ShouldShowSearchBanner", {}).then(engineName => {
    if (engineName) {
      document.l10n.setAttributes(
        document.getElementById("about-private-browsing-search-banner-title"),
        "about-private-browsing-search-banner-title",
        { engineName }
      );
      privateSearchBanner.removeAttribute("hidden");
      document.body.classList.add("showBanner");
    }

    // We set this attribute so that tests know when we are done.
    document.documentElement.setAttribute("SearchBannerInitialized", true);
  });

  function hideSearchBanner() {
    privateSearchBanner.hidden = true;
    document.body.classList.remove("showBanner");
    RPMSendAsyncMessage("SearchBannerDismissed");
  }

  document
    .getElementById("search-banner-close-button")
    .addEventListener("click", () => {
      hideSearchBanner();
    });

  let openSearchOptions = document.getElementById(
    "about-private-browsing-search-banner-description"
  );
  let openSearchOptionsEvtHandler = evt => {
    if (
      evt.target.id == "open-search-options-link" &&
      (evt.keyCode == evt.DOM_VK_RETURN || evt.type == "click")
    ) {
      RPMSendAsyncMessage("OpenSearchPreferences");
      hideSearchBanner();
    }
  };
  openSearchOptions.addEventListener("click", openSearchOptionsEvtHandler);
  openSearchOptions.addEventListener("keypress", openSearchOptionsEvtHandler);
});
