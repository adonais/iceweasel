/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";
import { OnDeviceModelManager } from "chrome://browser/content/preferences/OnDeviceModelManager.mjs";

/**
 * @import { OnDeviceModelFeaturesEnum } from "chrome://browser/content/preferences/OnDeviceModelManager.mjs"
 * @typedef {typeof AiControlGlobalStates[keyof typeof AiControlGlobalStates]} AiControlGlobalStatesEnum
 */

const XPCOMUtils = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
).XPCOMUtils;
const lazy = XPCOMUtils.declareLazy({
  GenAI: "resource:///modules/GenAI.sys.mjs",
});

Preferences.addAll([
  // browser.ai.control.* prefs defined in main.js
  { id: "browser.ml.chat.provider", type: "string" },
  { id: "browser.aiwindow.enabled", type: "bool" },
  { id: "browser.aiwindow.preferences.enabled", type: "bool" },
]);

Preferences.addSetting({ id: "aiControlsDescription" });
Preferences.addSetting({ id: "blockAiGroup" });
Preferences.addSetting({ id: "blockAiDescription" });
Preferences.addSetting({ id: "onDeviceFieldset" });
Preferences.addSetting({
  id: "onDeviceGroup",
  deps: [
    "aiControlTranslationsSelect",
    "aiControlPdfjsAltTextSelect",
    "aiControlSmartTabGroupsSelect",
    "aiControlLinkPreviewKeyPointsSelect",
  ],
  getControlConfig(config, deps) {
    for (let option of config.options) {
      let control = option.items[0];
      if (control.id in deps) {
        option.controlAttrs = option.controlAttrs || {};
        option.controlAttrs.class = deps[control.id].visible
          ? ""
          : "setting-hidden";
      }
    }
    return config;
  },
});
Preferences.addSetting({ id: "aiStatesDescription" });
Preferences.addSetting({ id: "sidebarChatbotFieldset" });
Preferences.addSetting({
  id: "aiBlockedMessage",
  deps: ["aiControlDefaultToggle"],
  visible: deps => deps.aiControlDefaultToggle.value,
});

const AiControlStates = Object.freeze({
  default: "default",
  enabled: "enabled",
  blocked: "blocked",
  available: "available",
});

const AiControlGlobalStates = Object.freeze({
  available: "available",
  blocked: "blocked",
});

/**
 * @param {AiControlGlobalStatesEnum} state
 */
function updateAiControlDefault(state) {
  let isBlocked = state == AiControlGlobalStates.blocked;
  for (let feature of Object.values(OnDeviceModelManager.features)) {
    if (isBlocked) {
      // Reset to default (blocked) state unless it was already blocked.
      OnDeviceModelManager.disable(feature);
    } else if (!isBlocked && !OnDeviceModelManager.isEnabled(feature)) {
      // Reset to default (available) state unless it was manually enabled.
      OnDeviceModelManager.reset(feature);
    }
  }
  if (isBlocked) {
    Services.prefs.setStringPref(
      "browser.ai.control.default",
      AiControlGlobalStates.blocked
    );
  }
  // There's no feature-specific dropdown for extensions since it's still a
  // trial feature, so just turn it off/on based on the global switch.
  Services.prefs.setBoolPref("extensions.ml.enabled", !isBlocked);
  Glean.browser.globalAiControlToggled.record({ blocked: isBlocked });
}

class BlockAiConfirmationDialog extends MozLitElement {
  get dialog() {
    return this.renderRoot.querySelector("dialog");
  }

  get confirmButton() {
    return this.renderRoot.querySelector('moz-button[type="primary"]');
  }

  get cancelButton() {
    return this.renderRoot.querySelector('moz-button:not([type="primary"])');
  }

  async showModal() {
    await this.updateComplete;
    this.dialog.showModal();
  }

  handleCancel() {
    this.dialog.close();
  }

  handleConfirm() {
    this.dialog.close();
    updateAiControlDefault(AiControlGlobalStates.blocked);
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://global/skin/in-content/common.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/skin/preferences/preferences.css"
      />
      <link
        rel="stylesheet"
        href="chrome://browser/content/preferences/config/block-ai-confirmation-dialog.css"
      />
      <dialog aria-labelledby="heading" aria-describedby="content">
        <div class="dialog-header">
          <img
            class="dialog-header-icon"
            src="chrome://global/skin/icons/block.svg"
            alt=""
          />
          <h2
            id="heading"
            class="text-box-trim-start"
            data-l10n-id="preferences-ai-controls-block-confirmation-heading"
          ></h2>
        </div>
        <div id="content" class="dialog-body">
          <p
            data-l10n-id="preferences-ai-controls-block-confirmation-description"
          ></p>
          <p
            class="ul-prefix-p"
            data-l10n-id="preferences-ai-controls-block-confirmation-features-start"
          ></p>
          <ul>
            <li
              data-l10n-id="preferences-ai-controls-block-confirmation-translations"
            ></li>
            <li
              data-l10n-id="preferences-ai-controls-block-confirmation-pdfjs"
            ></li>
            <li
              data-l10n-id="preferences-ai-controls-block-confirmation-tab-group-suggestions"
            ></li>
            <li
              data-l10n-id="preferences-ai-controls-block-confirmation-key-points"
            ></li>
            <li
              data-l10n-id="preferences-ai-controls-block-confirmation-sidebar-chatbot"
            ></li>
          </ul>
          <p
            data-l10n-id="preferences-ai-controls-block-confirmation-features-after"
          ></p>
          <a is="moz-support-link" support-page="firefox-ai-controls"></a>
        </div>
        <moz-button-group>
          <moz-button
            data-l10n-id="preferences-ai-controls-block-confirmation-cancel"
            @click=${this.handleCancel}
          ></moz-button>
          <moz-button
            autofocus
            type="primary"
            data-l10n-id="preferences-ai-controls-block-confirmation-confirm"
            @click=${this.handleConfirm}
          ></moz-button>
        </moz-button-group>
      </dialog>
    `;
  }
}
customElements.define(
  "block-ai-confirmation-dialog",
  BlockAiConfirmationDialog
);

const AI_CONTROL_OPTIONS = [
  {
    value: AiControlStates.available,
    l10nId: "preferences-ai-controls-state-available",
  },
  {
    value: AiControlStates.enabled,
    l10nId: "preferences-ai-controls-state-enabled",
  },
  {
    value: AiControlStates.blocked,
    l10nId: "preferences-ai-controls-state-blocked",
  },
];

Preferences.addSetting({
  id: "aiControlDefaultToggle",
  pref: "browser.ai.control.default",
  setup() {
    document.body.append(
      document.createElement("block-ai-confirmation-dialog")
    );
  },
  get: prefVal =>
    prefVal in AiControlGlobalStates
      ? prefVal == AiControlGlobalStates.blocked
      : AiControlGlobalStates.available,
  set(inputVal, _, setting) {
    if (inputVal) {
      // Restore the toggle to not pressed, we're opening a dialog
      setting.onChange();
      let dialog = /** @type {BlockAiConfirmationDialog} */ (
        document.querySelector("block-ai-confirmation-dialog")
      );
      dialog.showModal();
    } else {
      updateAiControlDefault(AiControlGlobalStates.available);
    }
    return AiControlGlobalStates.available;
  },
});

/**
 * @param {object} options
 * @param {string} options.id Setting id to create
 * @param {string} options.pref Pref id for the state
 * @param {OnDeviceModelFeaturesEnum} options.feature Feature id for removing models
 * @param {boolean} [options.supportsEnabled] If the feature supports the "enabled" state
 * @param {SettingConfig['getControlConfig']} [options.getControlConfig] A getControlConfig implementation.
 */
function makeAiControlSetting({
  id,
  pref,
  feature,
  supportsEnabled = true,
  getControlConfig,
}) {
  Preferences.addSetting({
    id,
    pref,
    deps: ["aiControlDefault"],
    setup(emitChange) {
      /**
       * @param {nsISupports} _
       * @param {string} __
       * @param {string} changedFeature
       */
      const featureChange = (_, __, changedFeature) => {
        if (changedFeature == feature) {
          emitChange();
        }
      };
      Services.obs.addObserver(featureChange, "OnDeviceModelManagerChange");
      return () =>
        Services.obs.removeObserver(
          featureChange,
          "OnDeviceModelManagerChange"
        );
    },
    get(prefVal, deps) {
      if (
        prefVal == AiControlStates.blocked ||
        (prefVal == AiControlStates.default &&
          deps.aiControlDefault.value == AiControlGlobalStates.blocked) ||
        OnDeviceModelManager.isBlocked(feature)
      ) {
        return AiControlStates.blocked;
      }
      if (
        supportsEnabled &&
        (prefVal == AiControlStates.enabled ||
          OnDeviceModelManager.isEnabled(feature))
      ) {
        return AiControlStates.enabled;
      }
      return AiControlStates.available;
    },
    set(prefVal) {
      if (prefVal == AiControlStates.available) {
        OnDeviceModelManager.reset(feature);
      } else if (prefVal == AiControlStates.enabled) {
        OnDeviceModelManager.enable(feature);
      } else if (prefVal == AiControlStates.blocked) {
        OnDeviceModelManager.disable(feature);
      }
      return prefVal;
    },
    disabled() {
      return OnDeviceModelManager.isManagedByPolicy(feature);
    },
    visible() {
      return OnDeviceModelManager.isAllowed(feature);
    },
    getControlConfig,
  });
}
makeAiControlSetting({
  id: "aiControlTranslationsSelect",
  pref: "browser.ai.control.translations",
  feature: OnDeviceModelManager.features.Translations,
  supportsEnabled: false,
  getControlConfig(config, _, setting) {
    let isBlocked = setting.value == AiControlStates.blocked;
    let moreSettingsLink = config.options.at(-1);
    moreSettingsLink.hidden = isBlocked;
    config.supportPage = isBlocked ? "website-translation" : null;
    return config;
  },
});
makeAiControlSetting({
  id: "aiControlPdfjsAltTextSelect",
  pref: "browser.ai.control.pdfjsAltText",
  feature: OnDeviceModelManager.features.PdfAltText,
});
makeAiControlSetting({
  id: "aiControlSmartTabGroupsSelect",
  pref: "browser.ai.control.smartTabGroups",
  feature: OnDeviceModelManager.features.TabGroups,
});
makeAiControlSetting({
  id: "aiControlLinkPreviewKeyPointsSelect",
  pref: "browser.ai.control.linkPreviewKeyPoints",
  feature: OnDeviceModelManager.features.KeyPoints,
});

// sidebar chatbot
Preferences.addSetting({ id: "chatbotProviderItem" });
Preferences.addSetting({
  id: "chatbotProvider",
  pref: "browser.ml.chat.provider",
});
Preferences.addSetting(
  /** @type {{ feature: OnDeviceModelFeaturesEnum } & SettingConfig } */ ({
    id: "aiControlSidebarChatbotSelect",
    pref: "browser.ai.control.sidebarChatbot",
    deps: ["aiControlDefault", "chatbotProvider"],
    feature: OnDeviceModelManager.features.SidebarChatbot,
    setup(emitChange) {
      lazy.GenAI.init();
      /**
       * @param {nsISupports} _
       * @param {string} __
       * @param {string} changedFeature
       */
      const featureChange = (_, __, changedFeature) => {
        if (changedFeature == this.feature) {
          emitChange();
        }
      };
      Services.obs.addObserver(featureChange, "OnDeviceModelManagerChange");
      return () =>
        Services.obs.removeObserver(
          featureChange,
          "OnDeviceModelManagerChange"
        );
    },
    get(prefVal, deps) {
      if (
        prefVal == AiControlStates.blocked ||
        (prefVal == AiControlStates.default &&
          deps.aiControlDefault.value == AiControlGlobalStates.blocked) ||
        OnDeviceModelManager.isBlocked(this.feature)
      ) {
        return AiControlStates.blocked;
      }
      return deps.chatbotProvider.value || AiControlStates.available;
    },
    set(inputVal, deps) {
      if (inputVal == AiControlStates.blocked) {
        OnDeviceModelManager.disable(this.feature);
        return inputVal;
      }
      if (inputVal == AiControlStates.available) {
        OnDeviceModelManager.reset(this.feature);
        return inputVal;
      }
      if (inputVal) {
        // Enable the chatbot sidebar so it can be used with this provider.
        OnDeviceModelManager.enable(this.feature);
        deps.chatbotProvider.value = inputVal;
      }
      return AiControlStates.enabled;
    },
    disabled() {
      return OnDeviceModelManager.isManagedByPolicy(this.feature);
    },
    visible() {
      return OnDeviceModelManager.isAllowed(this.feature);
    },
    getControlConfig(config, _, setting) {
      let providerUrl = setting.value;
      let options = config.options.slice(0, 3);
      lazy.GenAI.chatProviders.forEach((provider, url) => {
        let isSelected = url == providerUrl;
        // @ts-expect-error provider.hidden isn't in the typing
        if (!isSelected && provider.hidden) {
          return;
        }
        options.push({
          value: url,
          controlAttrs: { label: provider.name },
        });
      });
      if (!options.some(opt => opt.value == providerUrl)) {
        options.push({
          value: providerUrl,
          controlAttrs: { label: providerUrl },
        });
      }
      return {
        ...config,
        options,
      };
    },
  })
);

Preferences.addSetting({
  id: "AIWindowEnabled",
  pref: "browser.aiwindow.enabled",
});

Preferences.addSetting({
  id: "AIWindowPreferencesEnabled",
  pref: "browser.aiwindow.preferences.enabled",
});

// Only show the feature settings if the prefs are allowed to show and the
// feature isn't enabled.
Preferences.addSetting({
  id: "aiWindowFieldset",
  deps: ["AIWindowEnabled", "AIWindowPreferencesEnabled"],
  visible: deps => {
    return deps.AIWindowPreferencesEnabled.value && !deps.AIWindowEnabled.value;
  },
});

Preferences.addSetting({ id: "AIWindowItem" });
Preferences.addSetting({ id: "AIWindowHeader" });
Preferences.addSetting({ id: "AIWindowActivateLink" });

// Only show the AI Window features if the prefs are allowed to show and the
// feature is enabled.
// TODO: Enable when Model and Insight options are added
Preferences.addSetting({
  id: "aiFeaturesAIWindowGroup",
  deps: ["AIWindowEnabled", "AIWindowPreferencesEnabled"],
  visible: deps => {
    return deps.AIWindowPreferencesEnabled.value && deps.AIWindowEnabled.value;
  },
});

SettingGroupManager.registerGroups({
  aiControlsDescription: {
    card: "never",
    items: [
      {
        id: "aiControlsDescription",
        control: "moz-card",
        controlAttrs: {
          class: "ai-controls-description",
        },
        options: [
          {
            control: "p",
            options: [
              {
                control: "span",
                l10nId: "preferences-ai-controls-description",
              },
              {
                control: "span",
                controlAttrs: {
                  ".textContent": " ",
                },
              },
              {
                control: "a",
                controlAttrs: {
                  is: "moz-support-link",
                  "support-page": "firefox-ai-controls",
                },
              },
            ],
          },
          {
            control: "img",
            controlAttrs: {
              src: "chrome://browser/skin/preferences/fox-ai.svg",
            },
          },
        ],
      },
    ],
  },
  aiStatesDescription: {
    card: "never",
    items: [
      {
        id: "aiStatesDescription",
        control: "footer",
        controlAttrs: {
          class: "text-deemphasized",
        },
        options: [
          {
            control: "span",
            l10nId: "preferences-ai-controls-state-description-before",
          },
          {
            control: "ul",
            options: [
              {
                control: "li",
                l10nId: "preferences-ai-controls-state-description-available",
              },
              {
                control: "li",
                l10nId: "preferences-ai-controls-state-description-enabled",
              },
              {
                control: "li",
                l10nId: "preferences-ai-controls-state-description-blocked",
              },
            ],
          },
        ],
      },
    ],
  },
  aiFeatures: {
    card: "always",
    items: [
      {
        id: "blockAiGroup",
        control: "moz-box-item",
        items: [
          {
            id: "aiControlDefaultToggle",
            l10nId: "preferences-ai-controls-block-ai",
            control: "moz-toggle",
            controlAttrs: {
              headinglevel: 2,
              inputlayout: "inline-end",
            },
            options: [
              {
                l10nId: "preferences-ai-controls-block-ai-description",
                control: "span",
                slot: "description",
                options: [
                  {
                    control: "a",
                    controlAttrs: {
                      "data-l10n-name": "link",
                      "support-page": "firefox-ai-controls",
                      is: "moz-support-link",
                    },
                  },
                ],
              },
            ],
          },
          {
            id: "aiBlockedMessage",
            control: "moz-message-bar",
            l10nId: "preferences-ai-controls-blocked-message",
          },
        ],
      },
      {
        id: "onDeviceFieldset",
        l10nId: "preferences-ai-controls-on-device-group",
        supportPage: "on-device-models",
        control: "moz-fieldset",
        controlAttrs: {
          headinglevel: 2,
          iconsrc: "chrome://browser/skin/device-desktop.svg",
        },
        items: [
          {
            id: "onDeviceGroup",
            control: "moz-box-group",
            options: [
              {
                control: "moz-box-item",
                items: [
                  {
                    id: "aiControlTranslationsSelect",
                    l10nId: "preferences-ai-controls-translations-control",
                    control: "moz-select",
                    controlAttrs: {
                      inputlayout: "inline-end",
                    },
                    options: [
                      ...AI_CONTROL_OPTIONS.filter(
                        opt => opt.value != AiControlStates.enabled
                      ),
                      {
                        control: "a",
                        l10nId:
                          "preferences-ai-controls-translations-more-link",
                        slot: "support-link",
                        controlAttrs: {
                          href: "#general-translations",
                        },
                      },
                    ],
                  },
                ],
              },
              {
                control: "moz-box-item",
                items: [
                  {
                    id: "aiControlPdfjsAltTextSelect",
                    l10nId: "preferences-ai-controls-pdfjs-control",
                    control: "moz-select",
                    controlAttrs: {
                      inputlayout: "inline-end",
                    },
                    supportPage: "pdf-alt-text",
                    options: [...AI_CONTROL_OPTIONS],
                  },
                ],
              },
              {
                control: "moz-box-item",
                items: [
                  {
                    id: "aiControlSmartTabGroupsSelect",
                    l10nId:
                      "preferences-ai-controls-tab-group-suggestions-control",
                    control: "moz-select",
                    controlAttrs: {
                      inputlayout: "inline-end",
                    },
                    supportPage: "how-use-ai-enhanced-tab-groups",
                    options: [...AI_CONTROL_OPTIONS],
                  },
                ],
              },
              {
                control: "moz-box-item",
                items: [
                  {
                    id: "aiControlLinkPreviewKeyPointsSelect",
                    l10nId: "preferences-ai-controls-key-points-control",
                    control: "moz-select",
                    controlAttrs: {
                      inputlayout: "inline-end",
                    },
                    supportPage: "use-link-previews-firefox",
                    options: [...AI_CONTROL_OPTIONS],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "aiWindowFieldset",
        control: "moz-fieldset",
        items: [
          {
            id: "AIWindowItem",
            control: "moz-box-group",
            items: [
              {
                id: "AIWindowHeader",
                l10nId: "try-ai-features-ai-window",
                control: "moz-box-item",
              },
              {
                id: "AIWindowActivateLink",
                l10nId: "try-ai-features-ai-window-activate-link",
                control: "moz-box-link",
              },
            ],
          },
        ],
      },
      {
        id: "sidebarChatbotFieldset",
        control: "moz-fieldset",
        l10nId: "preferences-ai-controls-sidebar-chatbot-group",
        supportPage: "ai-chatbot",
        controlAttrs: {
          headinglevel: 2,
          iconsrc: "chrome://browser/skin/sidebars.svg",
        },
        items: [
          {
            id: "chatbotProviderItem",
            control: "moz-box-item",
            items: [
              {
                id: "aiControlSidebarChatbotSelect",
                l10nId: "preferences-ai-controls-sidebar-chatbot-control",
                control: "moz-select",
                controlAttrs: {
                  inputlayout: "inline-end",
                },
                options: [
                  {
                    l10nId: "preferences-ai-controls-state-available",
                    value: AiControlStates.available,
                  },
                  {
                    l10nId: "preferences-ai-controls-state-blocked",
                    value: AiControlStates.blocked,
                  },
                  { control: "hr" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  aiWindowFeatures: {
    l10nId: "ai-window-features-group",
    headingLevel: 2,
    items: [
      {
        id: "aiFeaturesAIWindowGroup",
        control: "moz-box-group",
        // TODO: Add Model and Insight list
        // options: [
        // ],
      },
    ],
  },
});
