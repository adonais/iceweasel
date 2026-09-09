/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ContainerEditor } from "chrome://browser/content/usercontext/ContainerEditor.mjs";

const ANCHOR_ID = "userContext-icons";
const ANCHOR_PINNED_CLASS = "container-anchor-pinned";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
});

function unpinAnchor(anchor) {
  if (!anchor.classList.contains(ANCHOR_PINNED_CLASS)) {
    return;
  }
  anchor.hidden = true;
  anchor.classList.remove(ANCHOR_PINNED_CLASS);
}

/**
 * Shared entry point for the "Add new container" menu items. Shows a panel,
 * hosting the same editor as the about:preferences container dialog, anchored
 * to the URL-bar container indicator (revealing it temporarily when the
 * current tab has no container).
 */
export const ContainerCreationPanel = {
  /**
   * The menu items are also built by chrome windows without a browser command
   * set, like the Library and the legacy sidebars, so the panel is shown on the
   * topmost browser window rather than on the window owning the menu item,
   * opening one when none is available.
   *
   * @param {Window} sourceWin
   *   The chrome window the request originated from.
   * @param {string} [entrypoint]
   *   The UI entry point the request came from.
   */
  async open(sourceWin, entrypoint = "unknown") {
    let source = sourceWin.top;
    let win = source.gBrowser
      ? source
      : (lazy.BrowserWindowTracker.getTopWindow() ??
        (await lazy.BrowserWindowTracker.promiseOpenWindow()));
    if (win != source) {
      win.focus();
    }

    let doc = win.document;

    let panel = doc.getElementById("containerCreation-panel");
    if (panel.state == "open" || panel.state == "showing") {
      return;
    }

    Glean.containers.addContainerClicked.record({ source: entrypoint });

    let body = doc.getElementById("containerCreation-panel-body");
    body.replaceChildren();
    let editor = new ContainerEditor(body);
    editor.render();

    let createButton = doc.getElementById("containerCreation-create-button");
    let cancelButton = doc.getElementById("containerCreation-cancel-button");

    let updateValidity = () => {
      createButton.disabled = !editor.isValid;
    };
    editor.form.addEventListener("input", updateValidity);
    updateValidity();

    let onCreate = () => {
      editor.commit();
      panel.hidePopup();
    };
    let onCancel = () => panel.hidePopup();
    createButton.addEventListener("click", onCreate);
    cancelButton.addEventListener("click", onCancel);

    let anchor = doc.getElementById(ANCHOR_ID);

    panel.addEventListener("popupshown", () => editor.focus(), { once: true });
    panel.addEventListener(
      "popuphidden",
      () => {
        createButton.removeEventListener("click", onCreate);
        cancelButton.removeEventListener("click", onCancel);
        body.replaceChildren();
        unpinAnchor(anchor);
      },
      { once: true }
    );

    if (anchor.hidden) {
      anchor.classList.add(ANCHOR_PINNED_CLASS);
      anchor.hidden = false;
    }

    panel.openPopup(anchor, "bottomright topright");
  },
};
