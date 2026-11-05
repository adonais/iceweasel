/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { IPPPermissionRules, IPPPrincipalRules } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPSiteRuleManager.sys.mjs"
);

const RULE_BY_STATUS = {
  on: IPPPrincipalRules.INCLUDED,
  off: IPPPrincipalRules.EXCLUDED,
};

/**
 * The principal whose rule is being edited, or null when creating a new rule.
 *
 * @type {?nsIPrincipal}
 */
const gEditedPrincipal = window.arguments?.[0]?.origin
  ? Services.scriptSecurityManager.createContentPrincipalFromOrigin(
      window.arguments[0].origin
    )
  : null;

let gForm;
let gWebsiteInput;
let gWebsiteError;
let gStatusSelect;
let gSaveError;

/**
 * The height of the dialog's content, which the form tracks because it is the
 * only element here that is sized by its contents rather than by the frame.
 *
 * @returns {number}
 */
function contentHeight() {
  return gForm.getBoundingClientRect().height;
}

/**
 * Grow or shrink the dialog by however much its content just changed.
 *
 * resizeDialog() re-measures the document inside the frame it already sized,
 * so scrollHeight is floored at the frame's height and the dialog can only
 * ever get taller. resizeBy applies a delta to that size instead, which is
 * what SubDialog provides it for, and works in both directions.
 *
 * @param {number} before The content height before the change.
 */
function resizeForContent(before) {
  let delta = contentHeight() - before;
  if (delta) {
    window.resizeBy(0, delta);
  }
}

/**
 * The principal for the https origin of the typed website, or null when it
 * does not name one. A scheme-less or http entry is converted to https.
 *
 * @param {string} value
 * User input value in the website address field
 * @returns {?nsIPrincipal}
 * Principal to be saved as ipp-vpn permission setting
 */
function principalFromInput(value) {
  let website = value.trim();
  if (!website) {
    return null;
  }
  try {
    let uri = Services.io.newURI(
      website.includes("://") ? website : `https://${website}`
    );
    if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
      return null;
    }
    if (!uri.host || uri.host.includes("*")) {
      return null;
    }
    if (uri.schemeIs("http")) {
      uri = uri.mutate().setScheme("https").finalize();
    }
    return Services.scriptSecurityManager.createContentPrincipal(uri, {});
  } catch (e) {
    return null;
  }
}

/**
 * The frame a sub-dialog lives in is sized from the height of its content, so
 * anything that grows or shrinks the dialog has to ask for a new measurement.
 * Wait for the change to be rendered first: setAttributes only stamps the
 * Fluent id, and measuring before it is translated measures the old layout.
 *
 * @param {?string} l10nId The error to show under the field, or null to clear.
 */
async function setWebsiteError(l10nId) {
  if (!l10nId && !gWebsiteError.hasAttribute("data-l10n-id")) {
    return;
  }

  let before = contentHeight();
  gWebsiteInput.toggleAttribute("invalid", !!l10nId);
  let inputEl = gWebsiteInput.inputEl;
  if (l10nId) {
    inputEl.ariaInvalid = "true";
    // The error is outside the input's shadow root, where an aria-describedby
    // id can't reach it, so it has to be referenced by element. The field's
    // own description is kept alongside it.
    inputEl.ariaDescribedByElements = [
      gWebsiteError,
      gWebsiteInput.shadowRoot.getElementById("description"),
    ];
    document.l10n.setAttributes(gWebsiteError, l10nId);
  } else {
    inputEl.ariaInvalid = null;
    inputEl.ariaDescribedByElements = null;
    // Clearing the element references also removes the attribute, and
    // moz-input-text only renders aria-describedby="description" once, so
    // restore it rather than leave the field without its description.
    inputEl.setAttribute("aria-describedby", "description");
    gWebsiteError.removeAttribute("data-l10n-id");
    gWebsiteError.textContent = "";
  }

  await document.l10n.translateElements([gWebsiteError]);
  resizeForContent(before);
}

/**
 * @param {boolean} shown Whether the rule failed to save.
 */
async function setSaveError(shown) {
  if (gSaveError.hidden == !shown) {
    return;
  }

  let before = contentHeight();
  gSaveError.hidden = !shown;

  await gSaveError.updateComplete;
  resizeForContent(before);
}

window.addEventListener("DOMContentLoaded", async () => {
  gForm = document.querySelector(".vpn-site-rule-form");
  gWebsiteInput = document.getElementById("vpnSiteRuleWebsite");
  gWebsiteError = document.getElementById("vpnSiteRuleError");
  gStatusSelect = document.getElementById("vpnSiteRuleStatus");
  gSaveError = document.getElementById("vpnSiteRuleSaveError");

  let dialog = document.querySelector("dialog");
  let acceptButton = dialog.getButton("accept");

  if (gEditedPrincipal) {
    document.l10n.setAttributes(
      document.documentElement,
      "ip-protection-edit-site-rule-window"
    );
    document.l10n.setAttributes(dialog, "ip-protection-edit-site-rule-dialog");
    // The dialog only copies its button labels onto the buttons when it is
    // first connected, so the edit label has to be applied by hand.
    document.mozSubdialogReady = document.l10n
      .translateElements([dialog])
      .then(() => {
        acceptButton.label = dialog.getAttribute("buttonlabelaccept");
        acceptButton.accessKey = dialog.getAttribute("buttonaccesskeyaccept");
      });
    document.getElementById("vpnSiteRuleIntro").hidden = true;
    gWebsiteInput.value = gEditedPrincipal.origin;
    gStatusSelect.value =
      IPPPermissionRules.getRule(gEditedPrincipal) == IPPPrincipalRules.EXCLUDED
        ? "off"
        : "on";
    acceptButton.disabled = false;
  }

  gWebsiteInput.addEventListener("input", () => {
    acceptButton.disabled = !gWebsiteInput.value.trim();
    setWebsiteError(null);
    setSaveError(false);
  });

  document.addEventListener("dialogaccept", event => {
    let principal = principalFromInput(gWebsiteInput.value);
    if (!principal) {
      event.preventDefault();
      setWebsiteError("ip-protection-site-rule-invalid-error");
      gWebsiteInput.focus();
      setSaveError(false);
      return;
    }

    if (
      !gEditedPrincipal?.equals(principal) &&
      IPPPermissionRules.getRule(principal) != IPPPrincipalRules.DEFAULT
    ) {
      event.preventDefault();
      setWebsiteError("ip-protection-site-rule-duplicate-error");
      gWebsiteInput.focus();
      return;
    }

    try {
      IPPPermissionRules.setRule(
        principal,
        RULE_BY_STATUS[gStatusSelect.value]
      );

      if (gEditedPrincipal && !gEditedPrincipal.equals(principal)) {
        IPPPermissionRules.setRule(gEditedPrincipal, IPPPrincipalRules.DEFAULT);
      }
    } catch (e) {
      event.preventDefault();
      setSaveError(true);
    }
  });

  await gWebsiteInput.updateComplete;
  gWebsiteInput.focus();
});
