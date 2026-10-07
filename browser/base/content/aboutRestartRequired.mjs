/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable import/no-unassigned-import */
import "chrome://global/content/elements/moz-button.mjs";
import "chrome://global/content/elements/moz-button-group.mjs";

var AboutRestartRequired = {
  /* Only do autofocus if we're the toplevel frame; otherwise we
     don't want to call attention to ourselves!
  */
  async addAutofocus(button) {
    if (window.top != window) {
      return;
    }
    await button.updateComplete;
    button.setAttribute("autofocus", "true");
  },
  restart() {
    Services.startup.quit(
      Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit
    );
  },
  toggleDetails(toggle, details) {
    let expanded = !details.hidden;
    details.hidden = expanded;
    toggle.setAttribute("aria-expanded", !expanded);
    toggle.setAttribute(
      "data-l10n-id",
      expanded
        ? "restart-required-see-more-button"
        : "restart-required-see-less-button"
    );
  },
  init() {
    let restartButton = document.getElementById("restart");
    restartButton.addEventListener("click", () => this.restart());

    let toggle = document.getElementById("details-toggle");
    let details = document.getElementById("more-details");
    toggle.addEventListener("click", () => this.toggleDetails(toggle, details));

    this.addAutofocus(restartButton);
  },
};

AboutRestartRequired.init();

// Dispatch this event so tests can detect that we finished loading the page.
let event = new CustomEvent("AboutRestartRequiredLoad", { bubbles: true });
document.dispatchEvent(event);
