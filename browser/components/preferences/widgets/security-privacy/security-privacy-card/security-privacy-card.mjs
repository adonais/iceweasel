/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AppUpdater: "resource://gre/modules/AppUpdater.sys.mjs",
});

const L10N_IDS = {
  okHeader: "security-privacy-status-ok-header",
  problemHeader: "security-privacy-status-problem-header",
  okLabel: "security-privacy-status-ok-label",
  problemLabel: "security-privacy-status-problem-label",
  problemHelperLabel: "security-privacy-status-problem-helper-label",
  trackersPendingLabel: "security-privacy-status-pending-trackers-label",
  trackersLabel: "security-privacy-status-trackers-label",
  strictEnabledLabel: "security-privacy-status-strict-enabled-label",
  upToDateLabel: "security-privacy-status-up-to-date-label",
  updateNeededLabel: "security-privacy-status-update-needed-label",
  updateErrorLabel: "security-privacy-status-update-error-label",
  updateCheckingLabel: "security-privacy-status-update-checking-label",
  updateNeededDescription: "security-privacy-status-update-needed-description",
  updateButtonLabel: "security-privacy-status-update-button-label",
};

/**
 * Custom Element for a card holding configuration issues from the user settings
 */
export default class SecurityPrivacyCard extends MozLitElement {
  /**
   * Private member to check the App Updater status
   *
   * @returns {boolean} should we NOT warn the user about their app update status
   */
  #okUpdateStatus() {
    const okStatuses = [
      lazy.AppUpdater.STATUS.NO_UPDATES_FOUND,
      lazy.AppUpdater.STATUS.CHECKING,
      lazy.AppUpdater.STATUS.NO_UPDATER,
      lazy.AppUpdater.STATUS.UPDATE_DISABLED_BY_POLICY,
      lazy.AppUpdater.STATUS.OTHER_INSTANCE_HANDLING_UPDATES,
      undefined,
    ];

    return okStatuses.includes(this.appUpdateStatus);
  }

  get strictEnabled() {
    return this.setting.deps.etpStrictEnabled.value;
  }

  get trackersBlocked() {
    return this.setting.deps.trackerCount.value;
  }

  get appUpdateStatus() {
    return this.setting.deps.appUpdateStatus.value;
  }

  // This should really only be used for testing, as it
  // overrides the reported app updater state
  set appUpdateStatus(value) {
    this.requestUpdate();
    this.setting.deps.appUpdateStatus.value = value;
  }

  get configIssueCount() {
    let filteredWarnings = [
      "etpStrictEnabled",
      "trackerCount",
      "appUpdateStatus",
    ];
    return Object.values(this.setting.deps).filter(
      warning => !filteredWarnings.includes(warning.id) && warning.visible
    ).length;
  }

  /**
   * Scrolling to an element in about:preferences is non-trivial because the fragment is controlled
   * by the panel manager. So we need this logic.
   *
   * @param {string} panelHash - the ID of the panel the element we want to scroll to lives on
   * @param {string} targetId - the ID of the element to scroll to
   * @returns {Function} a callback that will perform the scroll
   */
  #scrollToTargetOnPanel(panelHash, targetId) {
    return function () {
      // This actually scrolls to the target ID, if it exists.
      // It looks in the document first, then the shadowRoot for that ID.
      const scrollIntoView = () => {
        let target = document.getElementById(targetId);
        if (!target) {
          target = this.shadowRoot.getElementById(targetId);
        }
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
        }
      };
      if (panelHash !== undefined && document.location.hash != panelHash) {
        // If we are given a panel to go to, and we aren't already there,
        // switch to that panel and when it is shown, scrollIntoView.
        document.addEventListener("paneshown", scrollIntoView, { once: true });
        document.location.hash = panelHash;
      } else {
        // Here we are already on the panel, so we can just scroll straight to it.
        scrollIntoView();
      }
    };
  }

  /**
   * Create the bullet point for the current count of "issues" in the user profile.
   * Really only depends on `this.configIssueCount`
   *
   * @returns {TemplateResult} the HTML for the "issues" bullet of the custom element
   */
  buildIssuesElement() {
    if (this.configIssueCount == 0) {
      return html`<div class="status-bullet">
        <img
          class="check-bullet"
          src="chrome://global/skin/icons/check-filled.svg"
          alt="status ok"
        />
        <div data-l10n-id=${L10N_IDS.okLabel}></div>
      </div>`;
    }
    return html`<div class="status-bullet">
      <img
        class="alert-bullet"
        src="chrome://global/skin/icons/warning.svg"
        alt="status warning"
      />

      <div class="status-label-holder">
        <div data-l10n-id=${L10N_IDS.problemLabel}></div>
        <div>
          <small
            ><a
              href=""
              @click=${this.#scrollToTargetOnPanel(
                "#privacy",
                "securityWarningsGroup"
              )}
              data-l10n-id=${L10N_IDS.problemHelperLabel}
            ></a
          ></small>
        </div>
      </div>
    </div>`;
  }

  /**
   * Create the bullet point for the current count of trackers blocked in the past week.
   * Really only depends on `this.trackersBlocked`and `this.strictEnabled`
   *
   * @returns {TemplateResult} the HTML for the "trackers" bullet of the custom element
   */
  buildTrackersElement() {
    let trackerData = {
      trackerCount: this.trackersBlocked,
    };
    let trackerLabelElement =
      this.trackersBlocked != null
        ? html`<div
            data-l10n-id=${L10N_IDS.trackersLabel}
            data-l10n-args=${JSON.stringify(trackerData)}
          ></div>`
        : html`<div data-l10n-id=${L10N_IDS.trackersPendingLabel}></div>`;

    if (this.strictEnabled) {
      return html`<div class="status-bullet">
        <img
          class="check-bullet"
          src="chrome://global/skin/icons/check-filled.svg"
          alt="status ok"
        />
        <div class="status-label-holder">
          ${trackerLabelElement}
          <div>
            <small
              data-l10n-id=${L10N_IDS.strictEnabledLabel}
              id="strictEnabled"
              @click=${this.#scrollToTargetOnPanel("#privacy", "trackingGroup")}
            >
              <a data-l10n-name="strict-tracking-protection" href=""></a
            ></small>
          </div>
        </div>
      </div>`;
    }
    return html`<div class="status-bullet">
      <img
        class="check-bullet"
        src="chrome://global/skin/icons/check-filled.svg"
        alt="status ok"
      />
      ${trackerLabelElement}
    </div>`;
  }

  /**
   * Create the bullet point for the current update status bullet
   * Really only depends on `this.appUpdateStatus`
   *
   * @returns {TemplateResult} the HTML for the "update" bullet of the custom element
   */
  buildUpdateElement() {
    switch (this.appUpdateStatus) {
      case lazy.AppUpdater.STATUS.NO_UPDATES_FOUND:
        return html`<div class="status-bullet">
          <img
            class="check-bullet"
            src="chrome://global/skin/icons/check-filled.svg"
            alt="status ok"
          />
          <div data-l10n-id=${L10N_IDS.upToDateLabel}></div>
        </div>`;
      case lazy.AppUpdater.STATUS.MANUAL_UPDATE:
      case lazy.AppUpdater.STATUS.DOWNLOADING:
      case lazy.AppUpdater.STATUS.DOWNLOAD_AND_INSTALL:
      case lazy.AppUpdater.STATUS.STAGING:
      case lazy.AppUpdater.STATUS.READY_FOR_RESTART:
        return html`<div class="status-bullet">
          <img
            class="alert-bullet"
            src="chrome://global/skin/icons/warning.svg"
            alt="status warning"
          />
          <div class="status-label-holder">
            <div data-l10n-id=${L10N_IDS.updateNeededLabel}></div>
            <div>
              <small
                ><span data-l10n-id=${L10N_IDS.updateNeededDescription}></span
              ></small>
            </div>
            <moz-box-link
              @click=${this.#scrollToTargetOnPanel("#general", "updateApp")}
              data-l10n-id=${L10N_IDS.updateButtonLabel}
            ></moz-box-link>
          </div>
        </div>`;
      case lazy.AppUpdater.STATUS.NEVER_CHECKED:
      case lazy.AppUpdater.STATUS.UNSUPPORTED_SYSTEM:
      case lazy.AppUpdater.STATUS.DOWNLOAD_FAILED:
      case lazy.AppUpdater.STATUS.INTERNAL_ERROR:
      case lazy.AppUpdater.STATUS.CHECKING_FAILED:
        return html`<div class="status-bullet">
          <img
            class="alert-bullet"
            src="chrome://global/skin/icons/warning.svg"
            alt="status warning"
          />
          <div class="status-label-holder">
            <div data-l10n-id=${L10N_IDS.updateErrorLabel}></div>
            <div>
              <small
                ><span data-l10n-id=${L10N_IDS.updateNeededDescription}></span
              ></small>
            </div>
            <moz-box-link
              href="javascript:void(0)"
              @click=${this.#scrollToTargetOnPanel("#general", "updateApp")}
              data-l10n-id=${L10N_IDS.updateButtonLabel}
            ></moz-box-link>
          </div>
        </div>`;
      case lazy.AppUpdater.STATUS.CHECKING:
        return html`<div class="status-bullet">
          <img
            class="throbber-bullet"
            src="chrome://global/skin/icons/loading.svg"
            alt="status loading"
          />
          <div data-l10n-id=${L10N_IDS.updateCheckingLabel}></div>
        </div>`;
      case lazy.AppUpdater.STATUS.NO_UPDATER:
      case lazy.AppUpdater.STATUS.UPDATE_DISABLED_BY_POLICY:
      case lazy.AppUpdater.STATUS.OTHER_INSTANCE_HANDLING_UPDATES:
      case undefined:
      default:
        return html``;
    }
  }

  /**
   * Lit invoked callback to render a template for this component.
   * This creates a card for itself, populates it with bullets and headings,
   * and nests a <configuration-issue-card>.
   *
   * @returns {TemplateResult} the full HTML of this panel, CSS <link> and <moz-card>s included
   */
  render() {
    // Create l10n fields for the card's header
    let headerL10nId = L10N_IDS.okHeader;
    let headerL10nData = { problemCount: 0 };
    let trueIssueCount =
      this.configIssueCount + (this.#okUpdateStatus() ? 0 : 1);
    if (trueIssueCount > 0) {
      headerL10nId = L10N_IDS.problemHeader;
      headerL10nData.problemCount = trueIssueCount;
    }

    // And render this template!
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/preferences/widgets/security-privacy-card.css"
      />
      <moz-card aria-labelledby="heading">
        <div class="status-container">
          <div class="status-bullet-container">
            <div
              id="heading"
              data-l10n-id=${headerL10nId}
              data-l10n-args=${JSON.stringify(headerL10nData)}
            ></div>
            ${this.buildIssuesElement()} ${this.buildTrackersElement()}
            ${this.buildUpdateElement()}
          </div>
        </div>
      </moz-card>
    `;
  }
}
customElements.define("security-privacy-card", SecurityPrivacyCard);
