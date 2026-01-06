/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable import/no-unassigned-import */

import {
  gHasSts,
  gIsCertError,
  gErrorCode,
  isCaptive,
  getCSSClass,
  getHostName,
  getSubjectAltNames,
  getFailedCertificatesAsPEMString,
  recordSecurityUITelemetry,
  gOffline,
  retryThis,
  errorHasNoUserFix,
  COOP_MDN_DOCS,
  COEP_MDN_DOCS,
} from "chrome://global/content/aboutNetErrorHelpers.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import "chrome://global/content/elements/moz-button-group.mjs";
import "chrome://global/content/elements/moz-button.mjs";
import "chrome://global/content/elements/moz-support-link.mjs";

const HOST_NAME = getHostName();
const FELT_PRIVACY_REFRESH = RPMGetBoolPref(
  "security.certerrors.felt-privacy-v1",
  false
);

export class NetErrorCard extends MozLitElement {
  static properties = {
    hostname: { type: String },
    domainMismatchNames: { type: String },
    advancedShowing: { type: Boolean, reflect: true },
    certErrorDebugInfoShowing: { type: Boolean, reflect: true },
    certificateErrorText: { type: String },
  };

  static queries = {
    copyButtonTop: "#copyToClipboardTop",
    exceptionButton: "#exception-button",
    errorCode: "#errorCode",
    advancedContainer: ".advanced-container",
    advancedButton: "#advanced-button",
    certErrorIntro: "#certErrorIntro",
    certErrorDebugInfo: "#certificateErrorDebugInformation",
    certErrorText: "#certificateErrorText",
    viewCertificate: "#viewCertificate",
    certErrorBodyTitle: "#certErrorBodyTitle",
    returnButton: "#returnButton",
    learnMoreLink: "#learnMoreLink",
    whatCanYouDo: "#whatCanYouDo",
    whyDangerous: "#fp-why-site-dangerous",
    netErrorTitleText: "#neterror-title-text",
    netErrorLearnMoreLink: "#neterror-learn-more-link",
  };

  static ERROR_CODES = new Set([
    "SEC_ERROR_REVOKED_CERTIFICATE",
    "SEC_ERROR_UNKNOWN_ISSUER",
    "SSL_ERROR_BAD_CERT_DOMAIN",
    "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT",
    "SEC_ERROR_EXPIRED_CERTIFICATE",
    "SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE",
    "SSL_ERROR_NO_CYPHER_OVERLAP",
    "MOZILLA_PKIX_ERROR_INSUFFICIENT_CERTIFICATE_TRANSPARENCY",
    "NS_ERROR_OFFLINE",
    "NS_ERROR_DOM_COOP_FAILED",
    "NS_ERROR_DOM_COEP_FAILED",
  ]);

  static isSupported() {
    if (!FELT_PRIVACY_REFRESH) {
      return false;
    }

    const errorInfo = gIsCertError
      ? document.getFailedCertSecurityInfo()
      : document.getNetErrorInfo();
    let errorCode = errorInfo.errorCodeString
      ? errorInfo.errorCodeString
      : gErrorCode;

    if (gOffline) {
      errorCode = "NS_ERROR_OFFLINE";
    } else if (gErrorCode === "blockedByCOOP") {
      errorCode = "NS_ERROR_DOM_COOP_FAILED";
    } else if (gErrorCode === "blockedByCOEP") {
      errorCode = "NS_ERROR_DOM_COEP_FAILED";
    }

    return NetErrorCard.ERROR_CODES.has(errorCode);
  }

  constructor() {
    super();

    this.domainMismatchNames = null;
    this.advancedShowing = false;
    this.certErrorDebugInfoShowing = false;
    this.certificateErrorText = null;
    this.domainMismatchNamesPromise = null;
    this.certificateErrorTextPromise = null;
    this.showCustomNetErrorCard = false;
  }

  async getUpdateComplete() {
    const result = await super.getUpdateComplete();

    if (this.domainMismatchNames && this.certificateErrorText) {
      return result;
    }

    await Promise.all([
      gErrorCode === "domain-mismatch" && this.getDomainMismatchNames(),
      document.getFailedCertSecurityInfo && this.getCertificateErrorText(),
      this.domainMismatchNamesPromise,
      this.certificateErrorTextPromise,
    ]);

    return result;
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  firstUpdated() {
    // Dispatch this event so tests can detect that we finished loading the error page.
    document.dispatchEvent(
      new CustomEvent("AboutNetErrorLoad", { bubbles: true })
    );

    // Record telemetry when the error page loads
    if (gIsCertError && !isCaptive()) {
      if (this.failedCertInfo) {
        recordSecurityUITelemetry(
          "securityUiCerterror",
          "loadAboutcerterror",
          this.failedCertInfo
        );
      }
    }
  }

  shouldHideExceptionButton() {
    let prefValue = RPMGetBoolPref(
      "security.certerror.hideAddException",
      false
    );
    if (prefValue || errorHasNoUserFix(this.errorInfo.errorCodeString)) {
      return true;
    }

    const isIframed = window.self !== window.top;
    return gHasSts || !this.errorInfo.errorIsOverridable || isIframed;
  }

  init() {
    document.l10n.setAttributes(
      document.querySelector("title"),
      "fp-certerror-page-title"
    );

    this.errorInfo = this.getErrorInfo();
    this.hideExceptionButton = this.shouldHideExceptionButton();
    this.hostname = HOST_NAME;
    const { port } = document.location;
    if (port && port != 443) {
      this.hostname += ":" + port;
    }

    // We show an offline support page in case of a system-wide error,
    // when a user cannot connect to the internet and access the SUMO website.
    // For example, clock error, which causes certerrors across the web or
    // a security software conflict where the user is unable to connect
    // to the internet.
    // The URL that prompts us to show an offline support page should have the following
    // format: "https://support.mozilla.org/1/firefox/%VERSION%/%OS%/%LOCALE%/supportPageSlug",
    // so we can extract the support page slug.
    let baseURL = RPMGetFormatURLPref("app.support.baseURL");
    if (document.location.href.startsWith(baseURL)) {
      let supportPageSlug = document.location.pathname.split("/").pop();
      RPMSendAsyncMessage("DisplayOfflineSupportPage", {
        supportPageSlug,
      });
    }

    if (getCSSClass() == "expertBadCert") {
      this.toggleAdvancedShowing();
    }
  }

  getErrorInfo() {
    const errorInfo = gIsCertError
      ? document.getFailedCertSecurityInfo()
      : document.getNetErrorInfo();

    if (!errorInfo.errorCodeString) {
      this.showCustomNetErrorCard = true;
      if (gOffline) {
        errorInfo.errorCodeString = "NS_ERROR_OFFLINE";
      } else if (gErrorCode === "blockedByCOOP") {
        errorInfo.errorCodeString = "NS_ERROR_DOM_COOP_FAILED";
      } else if (gErrorCode === "blockedByCOEP") {
        errorInfo.errorCodeString = "NS_ERROR_DOM_COEP_FAILED";
      }

      errorInfo.errorCodeString = errorInfo.errorCodeString ?? gErrorCode;
    }
    return errorInfo;
  }

  introContentTemplate() {
    switch (this.errorInfo.errorCodeString) {
      case "SEC_ERROR_REVOKED_CERTIFICATE":
      case "SEC_ERROR_UNKNOWN_ISSUER":
      case "SSL_ERROR_BAD_CERT_DOMAIN":
      case "SEC_ERROR_EXPIRED_CERTIFICATE":
      case "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT":
        return html`<p
          id="certErrorIntro"
          data-l10n-id="fp-certerror-intro"
          data-l10n-args='{"hostname": "${this.hostname}"}'
        ></p>`;
      case "SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE":
        return html`<p
          data-l10n-id="fp-certerror-expired-intro"
          data-l10n-args='{"hostname": "${this.hostname}"}'
        ></p>`;
      case "SSL_ERROR_NO_CYPHER_OVERLAP":
        return html`<p
          data-l10n-id="fp-neterror-connection-intro"
          data-l10n-args='{"hostname": "${this.hostname}"}'
        ></p>`;
      case "MOZILLA_PKIX_ERROR_INSUFFICIENT_CERTIFICATE_TRANSPARENCY":
        return html`<p
          data-l10n-id="fp-certerror-transparency-intro"
          data-l10n-args='{"hostname": "${this.hostname}"}'
        ></p>`;
      case "NS_ERROR_OFFLINE":
        return html`<p
          data-l10n-id="fp-neterror-offline-intro"
          data-l10n-args='{"hostname": "${this.hostname}"}'
        ></p>`;
      case "NS_ERROR_DOM_COOP_FAILED":
      case "NS_ERROR_DOM_COEP_FAILED":
        return html`<p data-l10n-id="fp-neterror-coop-coep-intro"></p>`;
    }

    return null;
  }

  advancedContainerTemplate() {
    if (!this.advancedShowing) {
      return null;
    }

    let content;

    switch (this.errorInfo.errorCodeString) {
      case "SEC_ERROR_REVOKED_CERTIFICATE": {
        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-certerror-revoked-why-dangerous-body",
          whyDangerousL10nArgs: {
            hostname: this.hostname,
          },
          whatCanYouDoL10nId: "fp-certerror-revoked-what-can-you-do-body",
          learnMoreL10nId: "fp-learn-more-about-cert-issues",
          learnMoreSupportPage: "connection-not-secure",
          viewCert: true,
        });
        break;
      }
      case "SEC_ERROR_UNKNOWN_ISSUER": {
        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-certerror-unknown-issuer-why-dangerous-body",
          whatCanYouDoL10nId:
            "fp-certerror-unknown-issuer-what-can-you-do-body",
          learnMoreL10nId: "fp-learn-more-about-cert-issues",
          learnMoreSupportPage: "connection-not-secure",
          viewCert: true,
          viewDateTime: true,
        });
        break;
      }
      case "SSL_ERROR_BAD_CERT_DOMAIN": {
        if (this.domainMismatchNames === null) {
          this.getDomainMismatchNames();
          return null;
        }

        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-certerror-bad-domain-why-dangerous-body",
          whyDangerousL10nArgs: {
            hostname: this.hostname,
            validHosts: this.domainMismatchNames ?? "",
          },
          whatCanYouDoL10nId: "fp-certerror-bad-domain-what-can-you-do-body",
          learnMoreL10nId: "fp-learn-more-about-secure-connection-failures",
          learnMoreSupportPage: "connection-not-secure",
          viewCert: true,
          viewDateTime: true,
        });
        break;
      }
      case "SEC_ERROR_EXPIRED_CERTIFICATE": {
        const notBefore = this.errorInfo.validNotBefore;
        const notAfter = this.errorInfo.validNotAfter;
        if (notBefore && Date.now() < notAfter) {
          content = this.advancedSectionTemplate({
            whyDangerousL10nId: "fp-certerror-not-yet-valid-why-dangerous-body",
            whyDangerousL10nArgs: {
              date: notBefore,
            },
            whatCanYouDoL10nId: "fp-certerror-expired-what-can-you-do-body",
            whatCanYouDoL10nArgs: {
              date: Date.now(),
            },
            learnMoreL10nId: "fp-learn-more-about-time-related-errors",
            learnMoreSupportPage: "time-errors",
            viewCert: true,
            viewDateTime: true,
          });
        } else {
          content = this.advancedSectionTemplate({
            whyDangerousL10nId: "fp-certerror-expired-why-dangerous-body",
            whyDangerousL10nArgs: {
              date: notAfter,
            },
            whatCanYouDoL10nId: "fp-certerror-expired-what-can-you-do-body",
            whatCanYouDoL10nArgs: {
              date: Date.now(),
            },
            learnMoreL10nId: "fp-learn-more-about-time-related-errors",
            learnMoreSupportPage: "time-errors",
            viewCert: true,
            viewDateTime: true,
          });
        }
        break;
      }
      case "MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT": {
        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-certerror-self-signed-why-dangerous-body",
          whatCanYouDoL10nId: "fp-certerror-self-signed-what-can-you-do-body",
          importantNote: "fp-certerror-self-signed-important-note",
          viewCert: true,
          viewDateTime: true,
        });
        break;
      }
      case "SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE": {
        const notAfter = this.errorInfo.validNotAfter;
        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-certerror-expired-why-dangerous-body",
          whyDangerousL10nArgs: {
            date: notAfter,
          },
          whatCanYouDoL10nId: "fp-certerror-expired-what-can-you-do-body",
          whatCanYouDoL10nArgs: {
            date: Date.now(),
          },
          learnMoreL10nId: "fp-learn-more-about-time-related-errors",
          learnMoreSupportPage: "time-errors",
          viewCert: true,
          viewDateTime: true,
        });
        break;
      }
      case "SSL_ERROR_NO_CYPHER_OVERLAP": {
        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-neterror-cypher-overlap-why-dangerous-body",
          whatCanYouDoL10nId: "fp-neterror-cypher-overlap-what-can-you-do-body",
          learnMoreL10nId: "fp-cert-error-code",
          learnMoreL10nArgs: {
            error: this.errorInfo.errorCodeString,
          },
          learnMoreSupportPage: "connection-not-secure",
        });
        break;
      }
      case "MOZILLA_PKIX_ERROR_INSUFFICIENT_CERTIFICATE_TRANSPARENCY": {
        content = this.advancedSectionTemplate({
          whyDangerousL10nId: "fp-certerror-transparency-why-dangerous-body",
          whyDangerousL10nArgs: {
            hostname: this.hostname,
          },
          whatCanYouDoL10nId: "fp-certerror-transparency-what-can-you-do-body",
          learnMoreL10nId: "fp-learn-more-about-secure-connection-failures",
          learnMoreSupportPage: "connection-not-secure",
          viewCert: true,
        });
        break;
      }
    }

    return html`<div class="advanced-container">
      <h2 data-l10n-id="fp-certerror-advanced-title"></h2>
      ${content}
    </div>`;
  }

  advancedSectionTemplate(params) {
    let {
      whyDangerousL10nId,
      whyDangerousL10nArgs,
      whatCanYouDoL10nId,
      whatCanYouDoL10nArgs,
      importantNote,
      learnMoreL10nId,
      learnMoreL10nArgs,
      learnMoreSupportPage,
      viewCert,
      viewDateTime,
    } = params;
    return html`<p>
        ${whyDangerousL10nId
          ? html`<strong
                data-l10n-id="fp-certerror-why-site-dangerous"
              ></strong>
              <span
                id="fp-why-site-dangerous"
                data-l10n-id=${whyDangerousL10nId}
                data-l10n-args=${JSON.stringify(whyDangerousL10nArgs)}
              ></span>`
          : null}
      </p>
      ${whatCanYouDoL10nId
        ? html`<p>
            <strong data-l10n-id="fp-certerror-what-can-you-do"></strong>
            <span
              id="whatCanYouDo"
              data-l10n-id=${whatCanYouDoL10nId}
              data-l10n-args=${JSON.stringify(whatCanYouDoL10nArgs)}
            ></span>
          </p>`
        : null}
      ${importantNote ? html`<p data-l10n-id=${importantNote}></p>` : null}
      ${learnMoreL10nId
        ? html`<p>
            <a
              is="moz-support-link"
              support-page=${learnMoreSupportPage}
              data-l10n-id=${learnMoreL10nId}
              data-l10n-args=${JSON.stringify(learnMoreL10nArgs)}
              data-telemetry-id="learn_more_link"
              id="learnMoreLink"
              @click=${this.handleTelemetryClick}
            ></a>
          </p>`
        : null}
      ${viewCert
        ? html`<p>
            <a
              id="viewCertificate"
              data-l10n-id="fp-certerror-view-certificate-link"
              href="javascript:void(0)"
            ></a>
          </p>`
        : null}
      ${gIsCertError
        ? html`<p>
            <a
              id="errorCode"
              data-l10n-id="fp-cert-error-code"
              data-l10n-name="error-code-link"
              data-telemetry-id="error_code_link"
              data-l10n-args='{"error": "${this.errorInfo.errorCodeString}"}'
              @click=${this.toggleCertErrorDebugInfoShowing}
              href="#certificateErrorDebugInformation"
            ></a>
          </p>`
        : null}
      ${viewDateTime
        ? html`<p
            data-l10n-id="fp-datetime"
            data-l10n-args=${JSON.stringify({ datetime: Date.now() })}
          ></p>`
        : null}
      ${!this.hideExceptionButton
        ? html` <moz-button
            id="exception-button"
            data-l10n-id="fp-certerror-override-exception-button"
            data-l10n-args=${JSON.stringify({ hostname: this.hostname })}
            data-telemetry-id="exception_button"
            @click=${this.handleProceedToUrlClick}
          ></moz-button>`
        : null} `;
  }

  customNetErrorContainerTemplate() {
    if (!this.showCustomNetErrorCard) {
      return null;
    }

    let content;

    switch (this.errorInfo.errorCodeString) {
      case "NS_ERROR_OFFLINE": {
        content = this.customNetErrorSectionTemplate({
          titleL10nId: "fp-neterror-offline-body-title",
          whatCanYouDoL10nId: "fp-neterror-offline-what-can-you-do-body",
          whatCanYouDoL10nArgs: {
            hostname: this.hostname,
          },
          buttons: {
            tryAgain: true,
          },
        });
        break;
      }
      case "NS_ERROR_DOM_COOP_FAILED":
      case "NS_ERROR_DOM_COEP_FAILED": {
        content = this.customNetErrorSectionTemplate({
          titleL10nId: "fp-certerror-body-title",
          whyDidThisHappenL10nId:
            "fp-neterror-coop-coep-why-did-this-happen-body",
          whyDidThisHappenL10nArgs: {
            hostname: this.hostname,
          },
          learnMoreL10nId:
            gErrorCode === "blockedByCOOP"
              ? "certerror-coop-learn-more"
              : "certerror-coep-learn-more",
          learnMoreSupportPage:
            gErrorCode === "blockedByCOOP" ? COOP_MDN_DOCS : COEP_MDN_DOCS,
          buttons: {
            goBack: window.self === window.top,
          },
        });
        break;
      }
    }

    return html`<div class="custom-net-error-card">${content}</div>`;
  }

  customNetErrorSectionTemplate(params) {
    const {
      titleL10nId,
      whyDidThisHappenL10nId,
      whyDidThisHappenL10nArgs,
      whatCanYouDoL10nId,
      whatCanYouDoL10nArgs,
      learnMoreL10nId,
      learnMoreSupportPage,
      buttons = {},
    } = params;

    const { goBack = false, tryAgain = false } = buttons;

    return html`<h1 id="neterror-title-text" data-l10n-id=${titleL10nId}></h1>
      ${this.introContentTemplate()}
      ${whatCanYouDoL10nId
        ? html`<p>
            <strong data-l10n-id="fp-certerror-what-can-you-do"></strong>
            <span
              data-l10n-id=${whatCanYouDoL10nId}
              data-l10n-args=${JSON.stringify(whatCanYouDoL10nArgs)}
            ></span>
          </p>`
        : null}
      ${whyDidThisHappenL10nId
        ? html`<p>
            <strong data-l10n-id="fp-certerror-what-can-you-do"></strong>
            <span
              data-l10n-id=${whyDidThisHappenL10nId}
              data-l10n-args=${JSON.stringify(whyDidThisHappenL10nArgs)}
            ></span>
          </p>`
        : null}
      ${learnMoreL10nId
        ? html`<p>
            <a
              href=${learnMoreSupportPage}
              data-l10n-id=${learnMoreL10nId}
              data-telemetry-id="learn_more_link"
              id="neterror-learn-more-link"
              @click=${this.handleTelemetryClick}
              rel="noopener noreferrer"
              target="_blank"
            ></a>
          </p>`
        : null}
      ${tryAgain
        ? html`<moz-button-group
            ><moz-button
              id="tryAgainButton"
              type="primary"
              data-l10n-id="neterror-try-again-button"
              data-telemetry-id="try_again_button"
              @click=${this.handleTryAgain}
            ></moz-button
          ></moz-button-group>`
        : null}
      ${goBack
        ? html`<moz-button-group
            ><moz-button
              type="primary"
              data-l10n-id="fp-certerror-return-to-previous-page-recommended-button"
              data-telemetry-id="return_button_adv"
              id="returnButton"
              @click=${this.handleGoBackClick}
            ></moz-button
          ></moz-button-group>`
        : null}`;
  }

  async getDomainMismatchNames() {
    if (this.domainMismatchNamesPromise) {
      return;
    }

    this.domainMismatchNamesPromise = getSubjectAltNames(this.errorInfo);
    let subjectAltNames = await this.domainMismatchNamesPromise;
    this.domainMismatchNames = subjectAltNames.join(", ");
  }

  async getCertificateErrorText() {
    if (this.certificateErrorTextPromise) {
      return;
    }

    this.certificateErrorTextPromise = getFailedCertificatesAsPEMString();
    this.certificateErrorText = await this.certificateErrorTextPromise;
  }

  certErrorDebugInfoTemplate() {
    if (!this.certErrorDebugInfoShowing) {
      return null;
    }

    if (!this.certificateErrorText) {
      this.getCertificateErrorText();
      return null;
    }

    return html`<div
      id="certificateErrorDebugInformation"
      class="advanced-panel"
    >
      <moz-button
        id="copyToClipboardTop"
        data-telemetry-id="clipboard_button_top"
        data-l10n-id="neterror-copy-to-clipboard-button"
        @click=${this.copyCertErrorTextToClipboard}
      ></moz-button>
      <div id="certificateErrorText">${this.certificateErrorText}</div>
      <moz-button
        data-telemetry-id="clipboard_button_bot"
        data-l10n-id="neterror-copy-to-clipboard-button"
        @click=${this.copyCertErrorTextToClipboard}
      ></moz-button>
    </div>`;
  }

  handleGoBackClick(e) {
    this.handleTelemetryClick(e);
    RPMSendAsyncMessage("Browser:SSLErrorGoBack");
  }

  handleProceedToUrlClick(e) {
    this.handleTelemetryClick(e);
    const isPermanent =
      !RPMIsWindowPrivate() &&
      RPMGetBoolPref("security.certerrors.permanentOverride");
    document.addCertException(!isPermanent).then(
      () => {
        location.reload();
      },
      () => {}
    );
  }

  handleTryAgain(e) {
    this.handleTelemetryClick(e);
    retryThis(e);
  }

  toggleAdvancedShowing(e) {
    if (e) {
      this.handleTelemetryClick(e);
    }

    this.advancedShowing = !this.advancedShowing;

    if (!this.advancedShowing) {
      return;
    }

    this.revealAdvancedContainer();
  }

  async revealAdvancedContainer() {
    await this.getUpdateComplete();

    // Toggling the advanced panel must ensure that the debugging
    // information panel is hidden as well, since it's opened by the
    // error code link in the advanced panel.
    this.certErrorDebugInfoShowing = false;

    if (!this.exceptionButton) {
      this.resetReveal = null;
      return;
    }

    // Reveal, but disabled (and grayed-out) for 3.0s.
    if (this.exceptionButton) {
      this.exceptionButton.disabled = true;
    }

    // -

    if (this.resetReveal) {
      this.resetReveal(); // Reset if previous is pending.
    }
    let wasReset = false;
    this.resetReveal = () => {
      wasReset = true;
    };

    // Wait for 10 frames to ensure that the warning text is rendered
    // and gets all the way to the screen for the user to read it.
    // This is only ~0.160s at 60Hz, so it's not too much extra time that we're
    // taking to ensure that we're caught up with rendering, on top of the
    // (by default) whole second(s) we're going to wait based on the
    // security.dialog_enable_delay pref.
    // The catching-up to rendering is the important part, not the
    // N-frame-delay here.
    for (let i = 0; i < 10; i++) {
      await new Promise(requestAnimationFrame);
    }

    // Wait another Nms (default: 1000) for the user to be very sure. (Sorry speed readers!)
    const securityDelayMs = RPMGetIntPref("security.dialog_enable_delay", 1000);
    await new Promise(go => setTimeout(go, securityDelayMs));

    if (wasReset || !this.advancedShowing) {
      this.resetReveal = null;
      return;
    }

    // Enable and un-gray-out.
    if (this.exceptionButton) {
      this.exceptionButton.disabled = false;
    }
  }

  async toggleCertErrorDebugInfoShowing(event) {
    this.handleTelemetryClick(event);
    event.preventDefault();

    this.certErrorDebugInfoShowing = !this.certErrorDebugInfoShowing;

    if (this.certErrorDebugInfoShowing) {
      await this.getUpdateComplete();
      this.copyButtonTop.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      this.copyButtonTop.focus();
    }
  }

  copyCertErrorTextToClipboard(e) {
    this.handleTelemetryClick(e);
    navigator.clipboard.writeText(this.certificateErrorText);
  }

  handleTelemetryClick(event) {
    let target = event.originalTarget;
    if (!target.hasAttribute("data-telemetry-id")) {
      target = target.getRootNode().host;
    }
    let telemetryId = target.dataset.telemetryId;
    const category = gIsCertError
      ? "securityUiCerterror"
      : "securityUiNeterror";
    void recordSecurityUITelemetry(
      category,
      "click" +
        telemetryId
          .split("_")
          .map(word => word[0].toUpperCase() + word.slice(1))
          .join(""),
      this.errorInfo
    );
  }

  render() {
    if (!this.errorInfo) {
      return null;
    }

    return html`<link
        rel="stylesheet"
        href="chrome://global/skin/aboutNetError.css"
      />
      <article class="felt-privacy-container">
        <div class="img-container">
          <img src="chrome://global/skin/illustrations/security-error.svg" />
        </div>
        <div class="container">
          ${this.showCustomNetErrorCard
            ? html`${this.customNetErrorContainerTemplate()}`
            : html`<h1
                  id="certErrorBodyTitle"
                  data-l10n-id="fp-certerror-body-title"
                ></h1>
                ${this.introContentTemplate()}
                <moz-button-group
                  ><moz-button
                    type="primary"
                    data-l10n-id="fp-certerror-return-to-previous-page-recommended-button"
                    data-telemetry-id="return_button_adv"
                    id="returnButton"
                    @click=${this.handleGoBackClick}
                  ></moz-button
                  ><moz-button
                    id="advanced-button"
                    data-l10n-id=${this.advancedShowing
                      ? "fp-certerror-hide-advanced-button"
                      : "fp-certerror-advanced-button"}
                    data-telemetry-id="advanced_button"
                    @click=${this.toggleAdvancedShowing}
                  ></moz-button
                ></moz-button-group>
                ${this.advancedContainerTemplate()}
                ${this.certErrorDebugInfoTemplate()}`}
        </div>
      </article>`;
  }
}
