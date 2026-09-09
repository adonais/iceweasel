/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-sff-tab-selector.mjs";

const browser = window.docShell.chromeEventHandler;
const box = browser.closest(".dialogBox");
box.classList.add("spotlightBox");
box.setAttribute("sizeto", "available");
box.setAttribute("fixedsize", "false");

addEventListener("pagehide", () => {
  box.classList.remove("spotlightBox");
  box.removeAttribute("sizeto");
});

const dialogArguments = window.arguments[0];
const tabSelector = document.querySelector("ai-sff-tab-selector");

tabSelector.suggestedTabs = dialogArguments.suggestedTabs;
tabSelector.otherTabs = dialogArguments.otherTabs;

document.mozSubdialogReady = tabSelector.updateComplete;

tabSelector.addEventListener("tabs-selected", event => {
  dialogArguments.result = {
    selectedTabIds: event.detail.selectedTabIds,
  };
  window.close();
});

tabSelector.addEventListener("cancel", () => {
  window.close();
});
