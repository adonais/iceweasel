/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals AdjustableTitle */

const { ContainerEditor } = ChromeUtils.importESModule(
  "chrome://browser/content/usercontext/ContainerEditor.mjs",
  { global: "current" }
);

function setTitle() {
  let params = window.arguments[0] || {};
  let winElem = document.documentElement;
  if (params.userContextId) {
    document.l10n.setAttributes(winElem, "containers-window-update-settings3", {
      name: params.identity.name,
    });
  } else {
    document.l10n.setAttributes(winElem, "containers-window-new3");
  }
}
setTitle();

window.addEventListener("DOMContentLoaded", () => {
  AdjustableTitle.hide();

  let editor = new ContainerEditor(
    document.getElementById("containerEditorHost"),
    window.arguments[0] || {}
  );
  editor.render();

  let dialog = document.querySelector("dialog");
  let acceptButton = dialog.getButton("accept");
  let updateValidity = () => {
    acceptButton.disabled = !editor.isValid;
  };
  editor.form.addEventListener("input", updateValidity);
  updateValidity();

  document.addEventListener("dialogaccept", () => editor.commit());
});
