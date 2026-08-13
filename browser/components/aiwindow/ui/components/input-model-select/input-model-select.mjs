/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  html,
  nothing,
  repeat,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-badge.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

// TODO Bug 2053495: remove with mistral release pref
const MISTRAL_RELEASE_PREF = "browser.smartwindow.mistralRelease";
const { getModelDisplayOrder } = window.IS_STORYBOOK
  ? // TODO Bug 2053495: ensure TypeError doesn't occur in Storybook once pref gating has been removed
    { getModelDisplayOrder: () => ["1", "2", "3"] }
  : ChromeUtils.importESModule(
      "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
    );

// TODO Bug 2053495: remove with mistral release pref — delete
// MODEL_ICONS and make MODEL_ICONS_V2 the only set.
// Icon URL and l10n ID inlined as full URLs so they stay greppable

const MODEL_ICONS = {
  0: "chrome://browser/content/aiwindow/assets/model-choice-0.svg",
  1: "chrome://browser/content/aiwindow/assets/model-choice-1.svg",
  2: "chrome://browser/content/aiwindow/assets/model-choice-2.svg",
  3: "chrome://browser/content/aiwindow/assets/model-choice-3.svg",
};

const MODEL_ICONS_V2 = {
  0: "chrome://browser/content/aiwindow/assets/model-choice-0.svg",
  1: "chrome://browser/content/aiwindow/assets/model-choice-gemini.svg",
  2: "chrome://browser/content/aiwindow/assets/model-choice-qwen.svg",
  3: "chrome://browser/content/aiwindow/assets/model-choice-mistral.svg",
};
const BUTTON_LABEL_L10N_IDS = {
  0: "aiwindow-input-model-select-button-label-custom",
  1: "aiwindow-input-model-select-button-label-fast",
  2: "aiwindow-input-model-select-button-label-allpurpose",
  3: "aiwindow-input-model-select-button-label-personal",
};

/**
 * A model select that shows the current model choice and lets users change
 * their selection before smartbar prompt submission.
 *
 * @property {string} selectedModelId - The current selected model ID
 * @property {{[key: string]: {model: string, ownerName: string, labelId: string}}} availableModels - Map of model choice IDs to model data
 */
export class InputModelSelect extends MozLitElement {
  static shadowRootOptions = {
    ...MozLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  static properties = {
    selectedModelId: { type: String, reflect: true },
    defaultModelChoiceId: { type: String },
    availableModels: { type: Object },
    panelOpen: { type: Boolean, state: true },
    sidebarMode: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.selectedModelId = "";
    this.defaultModelChoiceId = null;
    this.availableModels = null;
    this.panelOpen = false;
    this.sidebarMode = false;
    this._menuId = `models-menu-${crypto.randomUUID()}`;
    // TODO Bug 2053495: remove with mistral release pref. Caches the pref and
    // re-renders the whole component when it changes (e.g. Nimbus enrollment
    // mid-session), so labels, order, and icons all update in place.
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "mistralRelease",
      MISTRAL_RELEASE_PREF,
      false,
      () => this.requestUpdate()
    );
    // defineLazyPreferenceGetter registers its pref observer on first read, so
    // touch the value here to arm the onUpdate callback above.
    void this.mistralRelease;
  }

  get #caretIcon() {
    return this.panelOpen
      ? "chrome://global/skin/icons/arrow-up-12.svg"
      : "chrome://global/skin/icons/arrow-down-12.svg";
  }

  #onPanelShown = () => {
    this.panelOpen = true;
  };

  #onPanelHidden = () => {
    this.panelOpen = false;
  };

  get #modelsList() {
    if (!this.availableModels) {
      return [];
    }
    const order = getModelDisplayOrder();
    const rank = index => {
      // Custom (choice "0") always leads the list.
      if (index === "0") {
        return -1;
      }
      const position = order.indexOf(index);
      // IDs not in the order list sort to the end.
      return position === -1 ? order.length : position;
    };
    return Object.entries(this.availableModels)
      .map(([index, availableModel]) => ({
        ...availableModel,
        index,
      }))
      .sort((a, b) => rank(a.index) - rank(b.index));
  }

  get #selectedModel() {
    return this.#modelsList.find(m => m.model === this.selectedModelId);
  }

  #setModelId(modelId) {
    const selectedModel = this.#modelsList.find(m => m.model === modelId);
    if (!selectedModel) {
      console.error(`Could not find model ID: [${modelId}]`);
      return;
    }

    if (modelId !== this.selectedModelId) {
      this.selectedModelId = modelId;
      this.dispatchEvent(
        new CustomEvent("aiwindow-input-model-select:model-change", {
          detail: { modelId, modelChoiceId: selectedModel.index },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  #openSmartwindowSettings() {
    this.dispatchEvent(
      new CustomEvent("aiwindow-input-model-select:open-settings", {
        bubbles: true,
        composed: true,
      })
    );
  }

  #getButtonLabelL10nId(choiceId) {
    return BUTTON_LABEL_L10N_IDS[choiceId];
  }

  #getDescriptionL10nId(choiceId) {
    if (choiceId === "0") {
      return "aiwindow-input-model-select-menu-item-description-custom";
    }
    if (this.mistralRelease) {
      return BUTTON_LABEL_L10N_IDS[choiceId];
    }
    return "aiwindow-input-model-select-menu-item-description";
  }

  #iconSrc(index) {
    return (this.mistralRelease ? MODEL_ICONS_V2 : MODEL_ICONS)[index];
  }

  render() {
    if (!this.#modelsList.length || !this.#selectedModel) {
      return html``;
    }

    const panelListTemplate = html`<panel-list
      id=${this._menuId}
      mistral-release=${this.mistralRelease}
      @shown=${this.#onPanelShown}
      @hidden=${this.#onPanelHidden}
    >
      ${repeat(
        this.#modelsList,
        item => item.index,
        item => html`
          <button
            class="model-item"
            role="menuitem"
            @click=${() => this.#setModelId(item.model)}
          >
            <span class="model-item-avatar">
              <img
                class="model-item-icon${item.index === "0"
                  ? " model-item-icon--custom"
                  : ""}"
                src=${this.#iconSrc(item.index)}
                alt=${this.mistralRelease ? item.shortName : nothing}
            /></span>
            <span class="model-item-content">
              <span class="model-item-header">
                ${this.mistralRelease && item.shortName
                  ? html`<span class="model-item-label"
                      >${item.shortName}</span
                    >`
                  : html`<span
                      class="model-item-label"
                      data-l10n-id=${this.#getButtonLabelL10nId(item.index)}
                    ></span>`}
                ${item.index === this.defaultModelChoiceId
                  ? html`<moz-badge
                      type="new"
                      data-l10n-id="aiwindow-input-model-select-default-badge"
                    ></moz-badge>`
                  : ""}
              </span>
              ${this.mistralRelease
                ? html`<span
                    class="model-item-details"
                    data-l10n-id=${this.#getButtonLabelL10nId(item.index)}
                  ></span>`
                : html`<span
                    class="model-item-details"
                    data-l10n-id=${this.#getDescriptionL10nId(item.index)}
                    data-l10n-args=${JSON.stringify({
                      model: item.model,
                      ownerName: item.ownerName,
                    })}
                  ></span>`}
            </span>
            ${item.model === this.selectedModelId
              ? html`<img
                  class="model-item-check"
                  src="chrome://global/skin/icons/check.svg"
                  alt=""
                />`
              : ""}
          </button>
        `
      )}
      <hr />
      <panel-item
        action="open-smartwindow-settings"
        role="link"
        data-l10n-id="aiwindow-input-model-select-settings-link"
        @click=${this.#openSmartwindowSettings}
      >
      </panel-item>
    </panel-list>`;

    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-panel-list.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/input-model-select.css"
      />
      <moz-button
        type="default"
        class="input-model-select-button"
        .menuId=${this._menuId}
        data-l10n-id=${this.mistralRelease && this.#selectedModel.brandName
          ? nothing
          : this.#getButtonLabelL10nId(this.#selectedModel.index)}
        label=${this.mistralRelease && this.#selectedModel.brandName
          ? this.#selectedModel.brandName
          : nothing}
        .iconSrc=${this.#caretIcon}
        iconPosition="end"
      >
      </moz-button>
      ${panelListTemplate}
    `;
  }
}

customElements.define("input-model-select", InputModelSelect);
