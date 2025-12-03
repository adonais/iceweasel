/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from browser-siteProtections.js */

ChromeUtils.defineESModuleGetters(this, {
  ContentBlockingAllowList:
    "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  PanelMultiView:
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  SiteDataManager: "resource:///modules/SiteDataManager.sys.mjs",
  UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
});

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "insecureConnectionTextEnabled",
  "security.insecure_connection_text.enabled"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "insecureConnectionTextPBModeEnabled",
  "security.insecure_connection_text.pbmode.enabled"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "httpsOnlyModeEnabled",
  "dom.security.https_only_mode"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "httpsFirstModeEnabled",
  "dom.security.https_first"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "schemelessHttpsFirstModeEnabled",
  "dom.security.https_first_schemeless"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "httpsFirstModeEnabledPBM",
  "dom.security.https_first_pbm"
);
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "httpsOnlyModeEnabledPBM",
  "dom.security.https_only_mode_pbm"
);

const ETP_ENABLED_ASSETS = {
  label: "trustpanel-etp-label-enabled",
  description: "trustpanel-etp-description-enabled",
  header: "trustpanel-header-enabled",
  innerDescription: "trustpanel-description-enabled2",
};

const ETP_DISABLED_ASSETS = {
  label: "trustpanel-etp-label-disabled",
  description: "trustpanel-etp-description-disabled",
  header: "trustpanel-header-disabled",
  innerDescription: "trustpanel-description-disabled",
};

class TrustPanel {
  #state = null;
  #secInfo = null;
  #uri = null;
  #uriHasHost = null;
  #pageExtensionPolicy = null;
  #isURILoadedFromFile = null;
  #isSecureContext = null;
  #isSecureInternalUI = null;

  #lastEvent = null;

  #blockers = {
    SocialTracking,
    ThirdPartyCookies,
    TrackingProtection,
    Fingerprinting,
    Cryptomining,
  };

  init() {
    for (let blocker of Object.values(this.#blockers)) {
      if (blocker.init) {
        blocker.init();
      }
    }
  }

  uninit() {
    for (let blocker of Object.values(this.#blockers)) {
      if (blocker.uninit) {
        blocker.uninit();
      }
    }
  }

  get #popup() {
    return document.getElementById("trustpanel-popup");
  }

  get #enabled() {
    return UrlbarPrefs.get("trustPanel.featureGate");
  }

  handleProtectionsButtonEvent(event) {
    event.stopPropagation();
    if (
      (event.type == "click" && event.button != 0) ||
      (event.type == "keypress" &&
        event.charCode != KeyEvent.DOM_VK_SPACE &&
        event.keyCode != KeyEvent.DOM_VK_RETURN)
    ) {
      return; // Left click, space or enter only
    }

    this.showPopup({ event, openingReason: "shieldButtonClicked" });
  }

  onContentBlockingEvent(event, _webProgress, _isSimulated, _previousState) {
    if (!this.#enabled) {
      return;
    }
    // First update all our internal state based on the allowlist and the
    // different blockers:
    this.anyDetected = false;
    this.anyBlocking = false;
    this.#lastEvent = event;

    // Check whether the user has added an exception for this site.
    this.hasException =
      ContentBlockingAllowList.canHandle(window.gBrowser.selectedBrowser) &&
      ContentBlockingAllowList.includes(window.gBrowser.selectedBrowser);

    // Update blocker state and find if they detected or blocked anything.
    for (let blocker of Object.values(this.#blockers)) {
      // Store data on whether the blocker is activated for reporting it
      // using the "report breakage" dialog. Under normal circumstances this
      // dialog should only be able to open in the currently selected tab
      // and onSecurityChange runs on tab switch, so we can avoid associating
      // the data with the document directly.
      blocker.activated = blocker.isBlocking(event);
      this.anyDetected = this.anyDetected || blocker.isDetected(event);
      this.anyBlocking = this.anyBlocking || blocker.activated;
    }
  }

  #initializePopup() {
    if (!this.#popup) {
      let wrapper = document.getElementById("template-trustpanel-popup");
      wrapper.replaceWith(wrapper.content);

      document
        .getElementById("trustpanel-popup-connection")
        .addEventListener("click", event =>
          this.#openSecurityInformationSubview(event)
        );
      document
        .getElementById("trustpanel-blocker-see-all")
        .addEventListener("click", event => this.#openBlockerSubview(event));
      document
        .getElementById("trustpanel-privacy-link")
        .addEventListener("click", () =>
          window.openTrustedLinkIn("about:preferences#privacy", "tab")
        );
      document
        .getElementById("trustpanel-clear-cookies-button")
        .addEventListener("click", event =>
          this.#showClearCookiesSubview(event)
        );
      document
        .getElementById("trustpanel-siteinformation-morelink")
        .addEventListener("click", () => this.#showSecurityPopup());
      document
        .getElementById("trustpanel-clear-cookie-cancel")
        .addEventListener("click", () => this.#hidePopup());
      document
        .getElementById("trustpanel-clear-cookie-clear")
        .addEventListener("click", () => this.#clearSiteData());
      document
        .getElementById("trustpanel-toggle")
        .addEventListener("click", () => this.#toggleTrackingProtection());
      document
        .getElementById("identity-popup-remove-cert-exception")
        .addEventListener("click", () => this.#removeCertException());
      document
        .getElementById("trustpanel-popup-security-httpsonlymode-menulist")
        .addEventListener("command", () => this.#changeHttpsOnlyPermission());
    }
  }

  showPopup() {
    this.#initializePopup();
    this.#updatePopup();

    let anchor = document.getElementById("trust-icon-container");
    let opts = { position: "bottomleft topleft" };
    PanelMultiView.openPopup(this.#popup, anchor, opts);
  }

  async #hidePopup() {
    let hidden = new Promise(c => {
      this.#popup.addEventListener("popuphidden", c, { once: true });
    });
    PanelMultiView.hidePopup(this.#popup);
    await hidden;
  }

  updateIdentity(state, uri) {
    if (!this.#enabled) {
      return;
    }
    try {
      // Account for file: urls and catch when "" is the value
      this.#uriHasHost = !!uri.host;
    } catch (ex) {
      this.#uriHasHost = false;
    }
    this.#state = state;
    this.#uri = uri;

    this.#secInfo = gBrowser.securityUI.secInfo;
    this.#pageExtensionPolicy = WebExtensionPolicy.getByURI(uri);
    this.#isURILoadedFromFile = uri.schemeIs("file");
    this.#isSecureContext = this.#getIsSecureContext();

    this.#isSecureInternalUI = false;
    if (this.#uri.schemeIs("about")) {
      let module = E10SUtils.getAboutModule(this.#uri);
      if (module) {
        let flags = module.getURIFlags(this.#uri);
        this.#isSecureInternalUI = !!(
          flags & Ci.nsIAboutModule.IS_SECURE_CHROME_UI
        );
      }
    }

    this.#updateUrlbarIcon();
  }

  #updateUrlbarIcon() {
    let icon = document.getElementById("trust-icon-container");
    let secureConnection = this.#isSecurePage();
    icon.className = "";

    if (this.#isURILoadedFromFile) {
      icon.classList.add("file");
    } else if (!this.#trackingProtectionEnabled) {
      icon.classList.add("inactive");
    } else if (secureConnection && this.#trackingProtectionEnabled) {
      icon.classList.add("secure");
    } else if (!secureConnection || !this.#trackingProtectionEnabled) {
      icon.classList.add("insecure");
    } else {
      icon.classList.add("warning");
    }

    icon.classList.toggle("chickletShown", this.#isSecureInternalUI);
  }

  async #updatePopup() {
    let secureConnection = this.#isSecurePage();

    let connection = "not-secure";
    if (secureConnection || this.#isInternalSecurePage(this.#uri)) {
      connection = "secure";
    }

    this.#popup.setAttribute("connection", connection);
    this.#popup.setAttribute(
      "tracking-protection",
      this.#trackingProtectionStatus()
    );

    let assets = this.#trackingProtectionEnabled
      ? ETP_ENABLED_ASSETS
      : ETP_DISABLED_ASSETS;
    let host = window.gIdentityHandler.getHostForDisplay();
    this.host = host;

    let favicon = await PlacesUtils.favicons.getFaviconForPage(this.#uri);
    document.getElementById("trustpanel-popup-icon").src =
      favicon?.uri.spec ?? "";

    let toggle = document.getElementById("trustpanel-toggle");
    toggle.toggleAttribute("pressed", this.#trackingProtectionEnabled);
    document.l10n.setAttributes(
      toggle,
      this.#trackingProtectionEnabled
        ? "trustpanel-etp-toggle-on"
        : "trustpanel-etp-toggle-off",
      { host }
    );

    let hostElement = document.getElementById("trustpanel-popup-host");
    hostElement.textContent = host;
    hostElement.setAttribute("tooltiptext", host);

    document.l10n.setAttributes(
      document.getElementById("trustpanel-etp-label"),
      assets.label
    );
    document.l10n.setAttributes(
      document.getElementById("trustpanel-etp-description"),
      assets.description
    );
    document.l10n.setAttributes(
      document.getElementById("trustpanel-header"),
      assets.header
    );
    document.l10n.setAttributes(
      document.getElementById("trustpanel-description"),
      assets.innerDescription
    );
    document.l10n.setAttributes(
      document.getElementById("trustpanel-connection-label"),
      secureConnection
        ? "trustpanel-connection-label-secure"
        : "trustpanel-connection-label-insecure"
    );

    let canHandle = ContentBlockingAllowList.canHandle(
      window.gBrowser.selectedBrowser
    );
    document
      .getElementById("trustpanel-toggle")
      .toggleAttribute("disabled", !canHandle);
    document
      .getElementById("trustpanel-toggle-section")
      .toggleAttribute("disabled", !canHandle);

    if (!this.anyDetected) {
      document.getElementById("trustpanel-blocker-section").hidden = true;
    } else {
      let count = 0;
      let blocked = [];
      let detected = [];

      for (let blocker of Object.values(this.#blockers)) {
        if (blocker.isBlocking(this.#lastEvent)) {
          blocked.push(blocker);
          count += await blocker.getBlockerCount();
        } else if (blocker.isDetected(this.#lastEvent)) {
          detected.push(blocker);
        }
      }
      document.l10n.setArgs(
        document.getElementById("trustpanel-blocker-section-header"),
        { count }
      );
      this.#addButtons("trustpanel-blocked", blocked, true);
      this.#addButtons("trustpanel-detected", detected, false);

      document
        .getElementById("trustpanel-blocker-section")
        .removeAttribute("hidden");
    }
  }

  async #showSecurityPopup() {
    await this.#hidePopup();
    window.BrowserCommands.pageInfo(null, "securityTab");
  }

  #removeCertException() {
    let overrideService = Cc["@mozilla.org/security/certoverride;1"].getService(
      Ci.nsICertOverrideService
    );
    overrideService.clearValidityOverride(
      this.#uri.host,
      this.#uri.port > 0 ? this.#uri.port : 443,
      gBrowser.contentPrincipal.originAttributes
    );
    BrowserCommands.reloadSkipCache();
    PanelMultiView.hidePopup(this.#popup);
  }

  #trackingProtectionStatus() {
    if (!this.#isSecurePage()) {
      return "warning";
    }
    return this.#trackingProtectionEnabled ? "enabled" : "disabled";
  }

  #openSecurityInformationSubview(event) {
    document.l10n.setAttributes(
      document.getElementById("trustpanel-securityInformationView"),
      "trustpanel-site-information-header",
      { host: this.host }
    );

    let customRoot = this.#isSecureConnection ? this.#hasCustomRoot() : false;
    let connection = this.#connectionState();
    let mixedcontent = this.#mixedContentState();
    let ciphers = this.#ciphersState();
    let httpsOnlyStatus = this.#httpsOnlyState();

    // Update all elements.
    let elementIDs = [
      "trustpanel-popup",
      "identity-popup-securityView-extended-info",
    ];

    for (let id of elementIDs) {
      let element = document.getElementById(id);
      this.#updateAttribute(element, "connection", connection);
      this.#updateAttribute(element, "ciphers", ciphers);
      this.#updateAttribute(element, "mixedcontent", mixedcontent);
      this.#updateAttribute(element, "isbroken", this.#isBrokenConnection);
      this.#updateAttribute(element, "customroot", customRoot);
      this.#updateAttribute(element, "httpsonlystatus", httpsOnlyStatus);
    }

    let { supplemental, owner, verifier } = this.#supplementalText();
    document.getElementById("identity-popup-content-supplemental").textContent =
      supplemental;
    document.getElementById("identity-popup-content-verifier").textContent =
      verifier;
    document.getElementById("identity-popup-content-owner").textContent = owner;

    document
      .getElementById("trustpanel-popup-multiView")
      .showSubView("trustpanel-securityInformationView", event.target);
  }

  async #openBlockerSubview(event) {
    document.l10n.setAttributes(
      document.getElementById("trustpanel-blockerView"),
      "trustpanel-blocker-header",
      { host: this.host }
    );
    document
      .getElementById("trustpanel-popup-multiView")
      .showSubView("trustpanel-blockerView", event.target);
  }

  async #openBlockerDetailsSubview(event, blocker, blocking) {
    let count = await blocker.getBlockerCount();
    let blockingKey = blocking ? "blocking" : "not-blocking";
    document.l10n.setAttributes(
      document.getElementById("trustpanel-blockerDetailsView"),
      blocker.l10nKeys.title[blockingKey]
    );
    document.l10n.setAttributes(
      document.getElementById("trustpanel-blocker-details-header"),
      `trustpanel-${blocker.l10nKeys.general}-${blockingKey}-tab-header`,
      { count }
    );
    document.l10n.setAttributes(
      document.getElementById("trustpanel-blocker-details-content"),
      `protections-panel-${blocker.l10nKeys.content}`
    );

    let listHeaderId;
    if (blocker.l10nKeys.general == "fingerprinter") {
      listHeaderId = "trustpanel-fingerprinter-list-header";
    } else if (blocker.l10nKeys.general == "cryptominer") {
      listHeaderId = "trustpanel-cryptominer-tab-list-header";
    } else {
      listHeaderId = "trustpanel-tracking-content-tab-list-header";
    }

    document.l10n.setAttributes(
      document.getElementById("trustpanel-blocker-details-list-header"),
      listHeaderId
    );

    let { items } = await blocker._generateSubViewListItems();
    document.getElementById("trustpanel-blocker-items").replaceChildren(items);
    document
      .getElementById("trustpanel-popup-multiView")
      .showSubView("trustpanel-blockerDetailsView", event.target);
  }

  async #showClearCookiesSubview(event) {
    document.l10n.setAttributes(
      document.getElementById("trustpanel-clearcookiesView"),
      "trustpanel-clear-cookies-header",
      { host: window.gIdentityHandler.getHostForDisplay() }
    );
    document
      .getElementById("trustpanel-popup-multiView")
      .showSubView("trustpanel-clearcookiesView", event.target);
  }

  async #addButtons(section, blockers, blocking) {
    let sectionElement = document.getElementById(section);

    if (!blockers.length) {
      sectionElement.hidden = true;
      return;
    }

    let children = blockers.map(async blocker => {
      let button = document.createElement("moz-button");
      button.classList.add("moz-button-subviewbutton-nav");
      button.setAttribute("iconsrc", blocker.iconSrc);
      button.setAttribute("type", "ghost icon");
      document.l10n.setAttributes(
        button,
        `trustpanel-list-label-${blocker.l10nKeys.general}`,
        { count: await blocker.getBlockerCount() }
      );
      button.addEventListener("click", event =>
        this.#openBlockerDetailsSubview(event, blocker, blocking)
      );
      return button;
    });

    sectionElement.hidden = false;
    sectionElement
      .querySelector(".trustpanel-blocker-buttons")
      .replaceChildren(...(await Promise.all(children)));
  }

  get #trackingProtectionEnabled() {
    return (
      !ContentBlockingAllowList.canHandle(window.gBrowser.selectedBrowser) ||
      !ContentBlockingAllowList.includes(window.gBrowser.selectedBrowser)
    );
  }

  #isSecurePage() {
    return (
      this.#state & Ci.nsIWebProgressListener.STATE_IS_SECURE ||
      this.#isInternalSecurePage(this.#uri)
    );
  }

  #isInternalSecurePage(uri) {
    if (uri.schemeIs("about")) {
      let module = E10SUtils.getAboutModule(uri);
      if (module) {
        let flags = module.getURIFlags(uri);
        if (flags & Ci.nsIAboutModule.IS_SECURE_CHROME_UI) {
          return true;
        }
      }
    }
    return false;
  }

  #clearSiteData() {
    let baseDomain = SiteDataManager.getBaseDomainFromHost(this.#uri.host);
    SiteDataManager.remove(baseDomain);
    this.#hidePopup();
  }

  #toggleTrackingProtection() {
    if (this.#trackingProtectionEnabled) {
      ContentBlockingAllowList.add(window.gBrowser.selectedBrowser);
    } else {
      ContentBlockingAllowList.remove(window.gBrowser.selectedBrowser);
    }

    PanelMultiView.hidePopup(this.#popup);
    window.BrowserCommands.reload();
  }

  #isHttpsOnlyModeActive(isWindowPrivate) {
    return httpsOnlyModeEnabled || (isWindowPrivate && httpsOnlyModeEnabledPBM);
  }

  #isHttpsFirstModeActive(isWindowPrivate) {
    return (
      !this.#isHttpsOnlyModeActive(isWindowPrivate) &&
      (httpsFirstModeEnabled || (isWindowPrivate && httpsFirstModeEnabledPBM))
    );
  }
  #isSchemelessHttpsFirstModeActive(isWindowPrivate) {
    return (
      !this.#isHttpsOnlyModeActive(isWindowPrivate) &&
      !this.#isHttpsFirstModeActive(isWindowPrivate) &&
      schemelessHttpsFirstModeEnabled
    );
  }
  /**
   * Helper to parse out the important parts of _secInfo (of the SSL cert in
   * particular) for use in constructing identity UI strings
   */
  #getIdentityData() {
    var result = {};
    var cert = this.#secInfo.serverCert;

    // Human readable name of Subject
    result.subjectOrg = cert.organization;

    // SubjectName fields, broken up for individual access
    if (cert.subjectName) {
      result.subjectNameFields = {};
      cert.subjectName.split(",").forEach(function (v) {
        var field = v.split("=");
        this[field[0]] = field[1];
      }, result.subjectNameFields);

      // Call out city, state, and country specifically
      result.city = result.subjectNameFields.L;
      result.state = result.subjectNameFields.ST;
      result.country = result.subjectNameFields.C;
    }

    // Human readable name of Certificate Authority
    result.caOrg = cert.issuerOrganization || cert.issuerCommonName;
    result.cert = cert;

    return result;
  }

  #getIsSecureContext() {
    if (gBrowser.contentPrincipal?.originNoSuffix != "resource://pdf.js") {
      return gBrowser.securityUI.isSecureContext;
    }

    // For PDF viewer pages (pdf.js) we can't rely on the isSecureContext field.
    // The backend will return isSecureContext = true, because the content
    // principal has a resource:// URI. Instead use the URI of the selected
    // browser to perform the isPotentiallyTrustWorthy check.

    let principal;
    try {
      principal = Services.scriptSecurityManager.createContentPrincipal(
        gBrowser.selectedBrowser.documentURI,
        {}
      );
      return principal.isOriginPotentiallyTrustworthy;
    } catch (error) {
      console.error(
        "Error while computing isPotentiallyTrustWorthy for pdf viewer page: ",
        error
      );
      return false;
    }
  }

  /**
   * Returns whether the issuer of the current certificate chain is
   * built-in (returns false) or imported (returns true).
   */
  #hasCustomRoot() {
    return !this.#secInfo.isBuiltCertChainRootBuiltInRoot;
  }

  /**
   * Whether the established HTTPS connection is considered "broken".
   * This could have several reasons, such as mixed content or weak
   * cryptography. If this is true, _isSecureConnection is false.
   */
  get #isBrokenConnection() {
    return this.#state & Ci.nsIWebProgressListener.STATE_IS_BROKEN;
  }

  /**
   * Whether the connection to the current site was done via secure
   * transport. Note that this attribute is not true in all cases that
   * the site was accessed via HTTPS, i.e. _isSecureConnection will
   * be false when _isBrokenConnection is true, even though the page
   * was loaded over HTTPS.
   */
  get #isSecureConnection() {
    // If a <browser> is included within a chrome document, then this._state
    // will refer to the security state for the <browser> and not the top level
    // document. In this case, don't upgrade the security state in the UI
    // with the secure state of the embedded <browser>.
    return (
      !this.#isURILoadedFromFile &&
      this.#state & Ci.nsIWebProgressListener.STATE_IS_SECURE
    );
  }

  get #isEV() {
    // If a <browser> is included within a chrome document, then this._state
    // will refer to the security state for the <browser> and not the top level
    // document. In this case, don't upgrade the security state in the UI
    // with the EV state of the embedded <browser>.
    return (
      !this.#isURILoadedFromFile &&
      this.#state & Ci.nsIWebProgressListener.STATE_IDENTITY_EV_TOPLEVEL
    );
  }

  get #isAssociatedIdentity() {
    return this.#state & Ci.nsIWebProgressListener.STATE_IDENTITY_ASSOCIATED;
  }

  get #isMixedActiveContentLoaded() {
    return (
      this.#state & Ci.nsIWebProgressListener.STATE_LOADED_MIXED_ACTIVE_CONTENT
    );
  }

  get #isMixedActiveContentBlocked() {
    return (
      this.#state & Ci.nsIWebProgressListener.STATE_BLOCKED_MIXED_ACTIVE_CONTENT
    );
  }

  get #isMixedPassiveContentLoaded() {
    return (
      this.#state & Ci.nsIWebProgressListener.STATE_LOADED_MIXED_DISPLAY_CONTENT
    );
  }

  get #isContentHttpsOnlyModeUpgraded() {
    return (
      this.#state & Ci.nsIWebProgressListener.STATE_HTTPS_ONLY_MODE_UPGRADED
    );
  }

  get #isContentHttpsOnlyModeUpgradeFailed() {
    return (
      this.#state &
      Ci.nsIWebProgressListener.STATE_HTTPS_ONLY_MODE_UPGRADE_FAILED
    );
  }

  get #isContentHttpsFirstModeUpgraded() {
    return (
      this.#state &
      Ci.nsIWebProgressListener.STATE_HTTPS_ONLY_MODE_UPGRADED_FIRST
    );
  }

  get #isCertUserOverridden() {
    return this.#state & Ci.nsIWebProgressListener.STATE_CERT_USER_OVERRIDDEN;
  }

  get #isCertErrorPage() {
    let { documentURI } = gBrowser.selectedBrowser;
    if (documentURI?.scheme != "about") {
      return false;
    }

    return (
      documentURI.filePath == "certerror" ||
      (documentURI.filePath == "neterror" &&
        new URLSearchParams(documentURI.query).get("e") == "nssFailure2")
    );
  }

  get #isSecurelyConnectedAboutNetErrorPage() {
    let { documentURI } = gBrowser.selectedBrowser;
    if (documentURI?.scheme != "about" || documentURI.filePath != "neterror") {
      return false;
    }

    let error = new URLSearchParams(documentURI.query).get("e");

    // Bug 1944993 - A list of neterrors without connection issues
    return error === "httpErrorPage" || error === "serverError";
  }

  get #isAboutNetErrorPage() {
    let { documentURI } = gBrowser.selectedBrowser;
    return documentURI?.scheme == "about" && documentURI.filePath == "neterror";
  }

  get #isAboutHttpsOnlyErrorPage() {
    let { documentURI } = gBrowser.selectedBrowser;
    return (
      documentURI?.scheme == "about" && documentURI.filePath == "httpsonlyerror"
    );
  }

  get #isPotentiallyTrustworthy() {
    return (
      !this.#isBrokenConnection &&
      (this.#isSecureContext ||
        gBrowser.selectedBrowser.documentURI?.scheme == "chrome")
    );
  }

  get #isAboutBlockedPage() {
    let { documentURI } = gBrowser.selectedBrowser;
    return documentURI?.scheme == "about" && documentURI.filePath == "blocked";
  }

  #supplementalText() {
    let supplemental = "";
    let verifier = "";
    let owner = "";

    // Fill in the CA name if we have a valid TLS certificate.
    if (this.#isSecureConnection || this.#isCertUserOverridden) {
      verifier = this.#tooltipText();
    }

    // Fill in organization information if we have a valid EV certificate.
    if (this.#isEV) {
      let iData = this.#getIdentityData();
      owner = iData.subjectOrg;
      verifier = this._identityIconLabel.tooltipText;

      // Build an appropriate supplemental block out of whatever location data we have
      if (iData.city) {
        supplemental += iData.city + "\n";
      }
      if (iData.state && iData.country) {
        supplemental += gNavigatorBundle.getFormattedString(
          "identity.identified.state_and_country",
          [iData.state, iData.country]
        );
      } else if (iData.state) {
        // State only
        supplemental += iData.state;
      } else if (iData.country) {
        // Country only
        supplemental += iData.country;
      }
    }
    return { supplemental, verifier, owner };
  }

  #tooltipText() {
    let tooltip = "";
    let warnTextOnInsecure =
      insecureConnectionTextEnabled ||
      (insecureConnectionTextPBModeEnabled &&
        PrivateBrowsingUtils.isWindowPrivate(window));

    if (this.#uriHasHost && this.#isSecureConnection) {
      // This is a secure connection.
      if (!this._isCertUserOverridden) {
        // It's a normal cert, verifier is the CA Org.
        tooltip = gNavigatorBundle.getFormattedString(
          "identity.identified.verifier",
          [this.#getIdentityData().caOrg]
        );
      }
    } else if (this.#isBrokenConnection) {
      if (this.#isMixedActiveContentLoaded) {
        this._identityBox.classList.add("mixedActiveContent");
        if (
          UrlbarPrefs.getScotchBonnetPref("trimHttps") &&
          warnTextOnInsecure
        ) {
          tooltip = gNavigatorBundle.getString("identity.notSecure.tooltip");
        }
      }
    } else if (!this.#isPotentiallyTrustworthy) {
      tooltip = gNavigatorBundle.getString("identity.notSecure.tooltip");
    }

    if (this._isCertUserOverridden) {
      // Cert is trusted because of a security exception, verifier is a special string.
      tooltip = gNavigatorBundle.getString(
        "identity.identified.verified_by_you"
      );
    }
    return tooltip;
  }

  #connectionState() {
    // Determine connection security information.
    let connection = "not-secure";
    if (this.#isSecureInternalUI) {
      connection = "chrome";
    } else if (this.#pageExtensionPolicy) {
      connection = "extension";
    } else if (this.#isURILoadedFromFile) {
      connection = "file";
    } else if (this.#isEV) {
      connection = "secure-ev";
    } else if (this.#isCertUserOverridden) {
      connection = "secure-cert-user-overridden";
    } else if (this.#isSecureConnection) {
      connection = "secure";
    } else if (this.#isCertErrorPage) {
      connection = "cert-error-page";
    } else if (this.#isAboutHttpsOnlyErrorPage) {
      connection = "https-only-error-page";
    } else if (this.#isAboutBlockedPage) {
      connection = "not-secure";
    } else if (this.#isSecurelyConnectedAboutNetErrorPage) {
      connection = "secure";
    } else if (this.#isAboutNetErrorPage) {
      connection = "net-error-page";
    } else if (this.#isAssociatedIdentity) {
      connection = "associated";
    } else if (this.#isPotentiallyTrustworthy) {
      connection = "file";
    }
    return connection;
  }

  #mixedContentState() {
    let mixedcontent = [];
    if (this.#isMixedPassiveContentLoaded) {
      mixedcontent.push("passive-loaded");
    }
    if (this.#isMixedActiveContentLoaded) {
      mixedcontent.push("active-loaded");
    } else if (this.#isMixedActiveContentBlocked) {
      mixedcontent.push("active-blocked");
    }
    return mixedcontent;
  }

  #ciphersState() {
    // We have no specific flags for weak ciphers (yet). If a connection is
    // broken and we can't detect any mixed content loaded then it's a weak
    // cipher.
    if (
      this.#isBrokenConnection &&
      !this.#isMixedActiveContentLoaded &&
      !this.#isMixedPassiveContentLoaded
    ) {
      return "weak";
    }
    return "";
  }

  #httpsOnlyState() {
    // If HTTPS-Only Mode is enabled, check the permission status
    const privateBrowsingWindow = PrivateBrowsingUtils.isWindowPrivate(window);
    const isHttpsOnlyModeActive = this.#isHttpsOnlyModeActive(
      privateBrowsingWindow
    );
    const isHttpsFirstModeActive = this.#isHttpsFirstModeActive(
      privateBrowsingWindow
    );
    const isSchemelessHttpsFirstModeActive =
      this.#isSchemelessHttpsFirstModeActive(privateBrowsingWindow);

    let httpsOnlyStatus = "";

    if (
      isHttpsFirstModeActive ||
      isHttpsOnlyModeActive ||
      isSchemelessHttpsFirstModeActive
    ) {
      // Note: value and permission association is laid out
      //       in _getHttpsOnlyPermission
      let value = this.#getHttpsOnlyPermission();

      // We do not want to display the exception ui for schemeless
      // HTTPS-First, but we still want the "Upgraded to HTTPS" label.
      document.getElementById(
        "trustpanel-popup-security-httpsonlymode"
      ).hidden = isSchemelessHttpsFirstModeActive;

      document.getElementById(
        "trustpanel-popup-security-menulist-off-item"
      ).hidden = privateBrowsingWindow && value != 1;
      document.getElementById(
        "trustpanel-popup-security-httpsonlymode-menulist"
      ).value = value;

      if (value > 0) {
        httpsOnlyStatus = "exception";
      } else if (
        this.#isAboutHttpsOnlyErrorPage ||
        (isHttpsFirstModeActive && this.#isContentHttpsOnlyModeUpgradeFailed)
      ) {
        httpsOnlyStatus = "failed-top";
      } else if (this.#isContentHttpsOnlyModeUpgradeFailed) {
        httpsOnlyStatus = "failed-sub";
      } else if (
        this.#isContentHttpsOnlyModeUpgraded ||
        this.#isContentHttpsFirstModeUpgraded
      ) {
        httpsOnlyStatus = "upgraded";
      }
    }
    return httpsOnlyStatus;
  }

  /**
   * Gets the current HTTPS-Only mode permission for the current page.
   * Values are the same as in #identity-popup-security-httpsonlymode-menulist,
   * -1 indicates a incompatible scheme on the current URI.
   */
  #getHttpsOnlyPermission() {
    let uri = gBrowser.currentURI;
    if (uri instanceof Ci.nsINestedURI) {
      uri = uri.QueryInterface(Ci.nsINestedURI).innermostURI;
    }
    if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
      return -1;
    }
    uri = uri.mutate().setScheme("http").finalize();
    const principal = Services.scriptSecurityManager.createContentPrincipal(
      uri,
      gBrowser.contentPrincipal.originAttributes
    );
    const { state } = SitePermissions.getForPrincipal(
      principal,
      "https-only-load-insecure"
    );
    switch (state) {
      case Ci.nsIHttpsOnlyModePermission.LOAD_INSECURE_ALLOW_SESSION:
        return 2; // Off temporarily
      case Ci.nsIHttpsOnlyModePermission.LOAD_INSECURE_ALLOW:
        return 1; // Off
      default:
        return 0; // On
    }
  }

  /**
   * Sets/removes HTTPS-Only Mode exception and possibly reloads the page.
   */
  #changeHttpsOnlyPermission() {
    // Get the new value from the menulist and the current value
    // Note: value and permission association is laid out
    //       in _getHttpsOnlyPermission
    const oldValue = this.#getHttpsOnlyPermission();
    if (oldValue < 0) {
      console.error(
        "Did not update HTTPS-Only permission since scheme is incompatible"
      );
      return;
    }

    let menulist = document.getElementById(
      "trustpanel-popup-security-httpsonlymode-menulist"
    );
    let newValue = parseInt(menulist.selectedItem.value, 10);

    // If nothing changed, just return here
    if (newValue === oldValue) {
      return;
    }

    // We always want to set the exception for the HTTP version of the current URI,
    // since when we check wether we should upgrade a request, we are checking permissons
    // for the HTTP principal (Bug 1757297).
    let newURI = gBrowser.currentURI;
    if (newURI instanceof Ci.nsINestedURI) {
      newURI = newURI.QueryInterface(Ci.nsINestedURI).innermostURI;
    }
    newURI = newURI.mutate().setScheme("http").finalize();
    const principal = Services.scriptSecurityManager.createContentPrincipal(
      newURI,
      gBrowser.contentPrincipal.originAttributes
    );

    // Set or remove the permission
    if (newValue === 0) {
      SitePermissions.removeFromPrincipal(
        principal,
        "https-only-load-insecure"
      );
    } else if (newValue === 1) {
      SitePermissions.setForPrincipal(
        principal,
        "https-only-load-insecure",
        Ci.nsIHttpsOnlyModePermission.LOAD_INSECURE_ALLOW,
        SitePermissions.SCOPE_PERSISTENT
      );
    } else {
      SitePermissions.setForPrincipal(
        principal,
        "https-only-load-insecure",
        Ci.nsIHttpsOnlyModePermission.LOAD_INSECURE_ALLOW_SESSION,
        SitePermissions.SCOPE_SESSION
      );
    }

    // If we're on the error-page, we have to redirect the user
    // from HTTPS to HTTP. Otherwise we can just reload the page.
    if (this.#isAboutHttpsOnlyErrorPage) {
      gBrowser.loadURI(newURI, {
        triggeringPrincipal:
          Services.scriptSecurityManager.getSystemPrincipal(),
        loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
      });
      PanelMultiView.hidePopup(this.#popup);
      return;
    }
    // The page only needs to reload if we switch between allow and block
    // Because "off" is 1 and "off temporarily" is 2, we can just check if the
    // sum of newValue and oldValue is 3.
    if (newValue + oldValue !== 3) {
      BrowserCommands.reloadSkipCache();
      PanelMultiView.hidePopup(this.#popup);
      // Ensure the browser is focused again, otherwise we may not trigger the
      // security delay on a potential error page following this reload.
      gBrowser.selectedBrowser.focus();
    }
  }

  #updateAttribute(elem, attr, value) {
    if (value) {
      elem.setAttribute(attr, value);
    } else {
      elem.removeAttribute(attr);
    }
  }
}

var gTrustPanelHandler = new TrustPanel();
