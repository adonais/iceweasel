/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const HTML_NS = "http://www.w3.org/1999/xhtml";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ContextualIdentityService:
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
});

/**
 * Renders the contextual identity (container) create/edit form and applies the
 * change to the ContextualIdentityService. Shared between the preferences
 * subdialog and the container-creation panel anchored to the URL bar so that
 * the form markup and the create/update logic live in a single place.
 *
 * @param {Element} host
 *   The element the form is appended to.
 * @param {object} [options]
 * @param {?number} [options.userContextId]
 *   When set, the form edits the matching container; otherwise it creates one.
 * @param {?object} [options.identity]
 *   The initial { name, icon, color } values. Defaults to an empty name and the
 *   first available icon and color.
 */
export class ContainerEditor {
  constructor(host, { userContextId = null, identity = null } = {}) {
    this.host = host;
    this.document = host.ownerDocument;
    this.userContextId = userContextId;
    this.identity = identity || {
      name: "",
      icon: lazy.ContextualIdentityService.containerIcons[0],
      color: lazy.ContextualIdentityService.containerColors[0],
    };
  }

  render() {
    let doc = this.document;
    doc.defaultView.MozXULElement.insertFTLIfNeeded(
      "browser/preferences/containers.ftl"
    );

    this.form = doc.createElementNS(HTML_NS, "form");
    this.form.className = "container-editor";

    this._name = doc.createElementNS(HTML_NS, "moz-input-text");
    this._name.setAttribute("name", "name");
    doc.l10n.setAttributes(this._name, "containers-name-label2");

    this._colorPicker = this._createPicker("color", "containers-color-label2");
    this._colorPicker.classList.add("color-swatches");

    this._iconPicker = this._createPicker("icon", "containers-icon-label2");
    this._iconPicker.classList.add("icon-swatches");

    this.form.append(this._name, this._colorPicker, this._iconPicker);
    this.host.append(this.form);

    this._name.value = this.identity.name;
    this._buildSwatches(
      this._colorPicker,
      this.identity.color,
      lazy.ContextualIdentityService.containerColors,
      color => `identity-icon-circle identity-color-${color}`,
      color => lazy.ContextualIdentityService.getContainerColorLabel(color)
    );
    this._buildSwatches(
      this._iconPicker,
      this.identity.icon,
      lazy.ContextualIdentityService.containerIcons,
      icon => `identity-icon-${icon}`,
      icon => lazy.ContextualIdentityService.getContainerIconLabel(icon)
    );
  }

  _createPicker(pickerName, l10nId) {
    let picker = this.document.createElementNS(HTML_NS, "moz-visual-picker");
    picker.setAttribute("type", "radio");
    picker.setAttribute("name", pickerName);
    picker.classList.add("swatches");
    this.document.l10n.setAttributes(picker, l10nId);
    return picker;
  }

  _buildSwatches(picker, selected, values, iconClass, getLabel) {
    let doc = this.document;
    for (let value of values) {
      let title = getLabel(value);

      let item = doc.createElementNS(HTML_NS, "moz-visual-picker-item");
      item.className = "swatch";
      item.value = value;
      item.ariaLabel = title;
      item.title = title;

      let icon = doc.createElementNS(HTML_NS, "span");
      icon.className = `userContext-icon ${iconClass(value)}`;

      item.append(icon);
      picker.append(item);
    }

    picker.value = selected;
  }

  focus() {
    this._name.focus();
  }

  get isValid() {
    return !!this._name.value.trim();
  }

  commit() {
    let formData = new FormData(this.form);
    let containerName = formData.get("name").trim();
    let color = formData.get("color");
    let icon = formData.get("icon");

    if (!lazy.ContextualIdentityService.getContainerColorCode(color)) {
      throw new Error("Internal error. The color value doesn't match.");
    }
    if (!lazy.ContextualIdentityService.getContainerIconURL(icon)) {
      throw new Error("Internal error. The icon value doesn't match.");
    }

    if (this.userContextId) {
      lazy.ContextualIdentityService.update(
        this.userContextId,
        containerName,
        icon,
        color
      );
    } else {
      lazy.ContextualIdentityService.create(containerName, icon, color);
    }
  }
}
