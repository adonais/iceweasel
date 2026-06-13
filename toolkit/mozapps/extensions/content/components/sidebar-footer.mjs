/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* globals windowRoot */

class SidebarFooter extends HTMLElement {
  connectedCallback() {
    let list = document.createElement("ul");
    list.classList.add("sidebar-footer-list");

    let systemPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
    let prefsItem = this.createItem({
      icon: "chrome://global/skin/icons/settings.svg",
      createLinkElement: () => {
        let link = document.createElement("a");
        link.href = "about:preferences";
        link.id = "preferencesButton";
        return link;
      },
      titleL10nId: "sidebar-settings-button-title",
      labelL10nId: "addons-settings-button",
      onClick: e => {
        e.preventDefault();
        let hasAboutSettings = windowRoot.window.switchToTabHavingURI(
          "about:settings",
          false,
          {
            ignoreFragment: "whenComparing",
          }
        );
        if (!hasAboutSettings) {
          windowRoot.window.switchToTabHavingURI("about:preferences", true, {
            ignoreFragment: "whenComparing",
            triggeringPrincipal: systemPrincipal,
          });
        }
      },
    });

    let supportItem = this.createItem({
      icon: "chrome://global/skin/icons/help.svg",
      createLinkElement: () => {
        let link = document.createElement("a", { is: "moz-support-link" });
        link.setAttribute("support-page", "addons-help");
        link.id = "help-button";
        return link;
      },
      titleL10nId: "sidebar-help-button-title",
      labelL10nId: "help-button",
    });

    list.append(prefsItem, supportItem);
    this.append(list);
  }

  createItem({ onClick, titleL10nId, labelL10nId, icon, createLinkElement }) {
    let listItem = document.createElement("li");

    let link = createLinkElement();
    link.classList.add("sidebar-footer-link");
    link.addEventListener("click", onClick);
    document.l10n.setAttributes(link, titleL10nId);

    let img = document.createElement("img");
    img.src = icon;
    img.className = "sidebar-footer-icon";

    let label = document.createElement("span");
    label.className = "sidebar-footer-label";
    document.l10n.setAttributes(label, labelL10nId);

    link.append(img, label);
    listItem.append(link);
    return listItem;
  }
}
customElements.define("sidebar-footer", SidebarFooter, { extends: "footer" });
