/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  html,
  nothing,
  repeat,
} from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const RULE_L10N_IDS = {
  included: "ip-protection-site-rules-rule-included",
  excluded: "ip-protection-site-rules-rule-excluded",
};

const DELETE_RULE_PROMPT = {
  messageL10nId: "ip-protection-delete-site-rule-message",
  confirmL10nId: "ip-protection-delete-site-rule-confirm",
  errorL10nId: "ip-protection-delete-site-rule-error",
};

const DELETE_ALL_RULES_PROMPT = {
  messageL10nId: "ip-protection-delete-all-site-rules-message",
  confirmL10nId: "ip-protection-delete-all-site-rules-confirm",
  errorL10nId: "ip-protection-delete-all-site-rules-error",
};

const DELETE_RETURN_VALUE = "delete";

/**
 * The per-website VPN rules section of built-in VPN settings
 *
 * This element only presents the rules; every action is a moz-button carrying
 * a data-action, handled by the Setting that supplied the rules. The Setting
 * can ask the user to confirm a deletion with confirmDelete() or
 * confirmDeleteAll(), which run the deletion and offer to retry it if it
 * fails.
 *
 * @tagname vpn-site-rules-list
 * @property {object[]} value
 *   The rules to list, in render order. Each has an `origin` and a `rule` of
 *   either "included" or "excluded".
 * @property {object} control
 *   The setting-control wrapping this element, forwarded onto each action so
 *   that setting-group dispatches it back to the Setting.
 */
export default class VPNSiteRulesList extends MozLitElement {
  static properties = {
    value: { type: Array },
    control: { type: Object },
    deletePrompt: { type: Object, state: true },
    deleteFailed: { type: Boolean, state: true },
  };

  static queries = {
    addButtonEl: ".vpn-site-rules-add",
    deleteAllButtonEl: ".vpn-site-rules-delete-all",
    emptyStateEl: ".vpn-site-rules-empty",
    emptyIllustrationEl: ".vpn-site-rules-empty-illustration",
    listEl: ".vpn-site-rules-list",
    deleteDialogEl: ".vpn-site-rules-delete-dialog",
    deleteIconEl: ".vpn-site-rules-delete-icon",
    deleteMessageEl: ".vpn-site-rules-delete-message",
    deleteCancelButtonEl: ".vpn-site-rules-delete-cancel",
    deleteConfirmButtonEl: ".vpn-site-rules-delete-confirm",
  };

  constructor() {
    super();
    this.value = [];
    this.control = undefined;
    this.deletePrompt = null;
    this.deleteFailed = false;
  }

  #deleteRules = null;

  createRenderRoot() {
    return this;
  }

  get rules() {
    return Array.isArray(this.value) ? this.value : [];
  }

  /**
   * Ask the user to confirm deleting the rule for a website, then delete it.
   *
   * @param {string} website
   * @param {Function} deleteRule
   *   Deletes the rule. Throwing reports the failure and offers to try again.
   * @returns {Promise<boolean>} Whether the rule was deleted.
   */
  confirmDelete(website, deleteRule) {
    return this.#confirm(
      { ...DELETE_RULE_PROMPT, messageArgs: { website } },
      deleteRule
    );
  }

  /**
   * Ask the user to confirm deleting every rule, then delete them.
   *
   * @param {Function} deleteRules
   *   Deletes the rules. Throwing reports the failure and offers to try again.
   * @returns {Promise<boolean>} Whether the rules were deleted.
   */
  confirmDeleteAll(deleteRules) {
    return this.#confirm(DELETE_ALL_RULES_PROMPT, deleteRules);
  }

  /**
   * @param {object} deletePrompt
   *   Strings shown in the delete confirmation dialog.
   * @param {string} deletePrompt.messageL10nId
   *   Fluent ID for the dialog message.
   * @param {object} [deletePrompt.messageArgs]
   *   Fluent arguments for the message, such as the website.
   * @param {string} deletePrompt.confirmL10nId
   *   Fluent ID for the confirm button label.
   * @param {string} deletePrompt.errorL10nId
   *   Fluent ID for the message shown when the deletion fails.
   * @param {Function} deleteRules
   * @returns {Promise<boolean>} Whether the deletion succeeded.
   */
  async #confirm(deletePrompt, deleteRules) {
    this.deletePrompt = deletePrompt;
    this.deleteFailed = false;
    this.#deleteRules = deleteRules;
    await this.updateComplete;
    let dialog = this.deleteDialogEl;
    dialog.returnValue = "";
    let dialogClosed = new Promise(resolve =>
      dialog.addEventListener("close", resolve, { once: true })
    );
    dialog.showModal();
    await dialogClosed;
    this.#deleteRules = null;
    return dialog.returnValue == DELETE_RETURN_VALUE;
  }

  async #onDeleteConfirm() {
    try {
      await this.#deleteRules();
    } catch (e) {
      console.error(e);
      this.deleteFailed = true;
      return;
    }
    this.deleteDialogEl.close(DELETE_RETURN_VALUE);
  }

  /**
   * Renders a moz-button whose click is routed back to the Setting via
   * data-action.
   *
   * @param {object} options
   * @param {string} options.action
   *   Action to be taken when clicked, either edit or delete the rule.
   * @param {string} options.className
   *   Class used to query the button.
   * @param {string} options.l10nId
   *   Fluent ID for the button label.
   * @param {string} [options.website]
   *   Origin of the website rule this button is associated with.
   * @param {string} [options.iconSrc]
   *   Icon URL for the button.
   * @param {string} [options.type]
   *   moz-button type; defaults to "default".
   */

  #actionTemplate({ action, className, l10nId, website, iconSrc, type }) {
    return html`<moz-button
      slot=${website ? "actions" : nothing}
      class=${className}
      .type=${type ?? "default"}
      data-action=${action}
      data-origin=${website ?? nothing}
      .control=${this.control}
      .iconSrc=${iconSrc ?? ""}
      data-l10n-id=${l10nId}
      data-l10n-args=${website ? JSON.stringify({ website }) : nothing}
    ></moz-button>`;
  }

  #ruleTemplate({ origin: website, rule }) {
    return html`<moz-box-item
      class="vpn-site-rule"
      data-origin=${website}
      .label=${website}
      .iconSrc=${`page-icon:${website}`}
    >
      <span slot="description" data-l10n-id=${RULE_L10N_IDS[rule]}></span>
      ${this.#actionTemplate({
        action: "edit",
        className: "vpn-site-rule-edit",
        l10nId: "ip-protection-site-rules-edit-button",
        website,
        iconSrc: "chrome://global/skin/icons/edit.svg",
      })}
      ${this.#actionTemplate({
        action: "delete",
        className: "vpn-site-rule-delete",
        l10nId: "ip-protection-site-rules-delete-button",
        website,
        iconSrc: "chrome://global/skin/icons/delete.svg",
      })}
    </moz-box-item>`;
  }

  #listTemplate() {
    return html`<moz-box-group class="vpn-site-rules-list" type="list">
      ${repeat(
        this.rules,
        aRule => aRule.origin,
        aRule => this.#ruleTemplate(aRule)
      )}
    </moz-box-group>`;
  }

  #emptyStateTemplate() {
    return html`<moz-box-item class="vpn-site-rules-empty" layout="large-icon">
      <div class="vpn-site-rules-empty-content">
        <img
          class="vpn-site-rules-empty-illustration"
          src="chrome://global/skin/icons/settings.svg"
          alt=""
        />
        <span
          class="text-deemphasized"
          data-l10n-id="ip-protection-site-rules-empty"
        ></span>
      </div>
    </moz-box-item>`;
  }

  #deleteDialogTemplate() {
    let messageL10nId = this.deleteFailed
      ? this.deletePrompt?.errorL10nId
      : this.deletePrompt?.messageL10nId;
    let confirmL10nId = this.deleteFailed
      ? "ip-protection-delete-site-rule-retry"
      : this.deletePrompt?.confirmL10nId;
    return html`<dialog
      class="vpn-site-rules-delete-dialog"
      closedby="any"
      ?error=${this.deleteFailed}
      aria-labelledby="vpn-site-rules-delete-message"
    >
      <div class="vpn-site-rules-delete-content">
        <img
          class="vpn-site-rules-delete-icon"
          src=${this.deleteFailed
            ? "chrome://global/skin/icons/warning.svg"
            : "chrome://global/skin/icons/delete.svg"}
          alt=""
        />
        <p
          id="vpn-site-rules-delete-message"
          class="vpn-site-rules-delete-message"
          role=${this.deleteFailed ? "alert" : nothing}
          data-l10n-id=${messageL10nId ?? nothing}
          data-l10n-args=${!this.deleteFailed && this.deletePrompt?.messageArgs
            ? JSON.stringify(this.deletePrompt.messageArgs)
            : nothing}
        ></p>
      </div>
      <moz-button-group>
        <moz-button
          class="vpn-site-rules-delete-cancel"
          data-l10n-id="ip-protection-delete-site-rule-cancel"
          @click=${() => this.deleteDialogEl.close()}
        ></moz-button>
        <moz-button
          class="vpn-site-rules-delete-confirm"
          type="primary"
          data-l10n-id=${confirmL10nId ?? nothing}
          @click=${this.#onDeleteConfirm}
        ></moz-button>
      </moz-button-group>
    </dialog>`;
  }

  render() {
    return html`
      ${this.#deleteDialogTemplate()}
      <div class="vpn-site-rules">
        ${this.#actionTemplate({
          action: "add",
          className: "vpn-site-rules-add",
          l10nId: "ip-protection-site-rules-add-button",
          iconSrc: "chrome://global/skin/icons/plus.svg",
        })}
        ${this.rules.length ? this.#listTemplate() : this.#emptyStateTemplate()}
        ${this.rules.length
          ? this.#actionTemplate({
              action: "delete-all",
              className: "vpn-site-rules-delete-all",
              l10nId: "ip-protection-site-rules-delete-all-button",
              type: "secondary",
            })
          : nothing}
      </div>
    `;
  }
}

customElements.define("vpn-site-rules-list", VPNSiteRulesList);
