/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, when } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-url.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-text.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-input-password.mjs";

/* eslint-disable-next-line import/no-unassigned-import, mozilla/no-browser-refs-in-toolkit */
import "chrome://browser/content/aboutlogins/components/login-message-popup.mjs";

export class LoginForm extends MozLitElement {
  static properties = {
    type: { type: String, reflect: true },
    onSaveClick: { type: Function },
    onDeleteClick: { type: Function },
    onClose: { type: Function },
    onOriginClick: { type: Function },
    originValue: { type: String },
    usernameValue: { type: String },
    passwordValue: { type: String },
    passwordVisible: { type: Boolean },
    _showDeleteCard: { type: Boolean, state: true },
    _originInvalid: { type: Boolean, state: true },
    _passwordInvalid: { type: Boolean, state: true },
  };

  static queries = {
    formEl: "form",
    originField: "moz-input-url",
    usernameField: "moz-input-text",
    passwordField: "moz-input-password",
    originWarning: "origin-warning",
    passwordWarning: "password-warning",
  };

  constructor() {
    super();
    this.originValue = "";
    this.usernameValue = "";
    this.passwordValue = "";
    this._showDeleteCard = false;
    this._originInvalid = false;
    this._passwordInvalid = false;
  }

  async firstUpdated() {
    const mozButtonGroup = this.shadowRoot.querySelector("moz-button-group");
    // Wait for the button group to complete its update cycle since it might reorder its slots.
    await mozButtonGroup.updateComplete;
    this.#handleKeyPressOnLastButton(mozButtonGroup);

    await this.passwordField.updateComplete;
    this.passwordField.inputEl.setAttribute("aria-required", "true");
    if (this.originField) {
      await this.originField.updateComplete;
      this.originField.inputEl.setAttribute("aria-required", "true");
    }
  }

  #revealPassword() {
    this.passwordField.inputEl.type = "text";
  }

  #concealPassword() {
    this.passwordField.inputEl.type = "password";
  }

  #addHTTPSPrefix() {
    const originValue = this.originField.value.trim();
    if (originValue && !originValue.match(/:\/\//)) {
      this.originField.value = "https://" + originValue;
    }
  }

  #renderReadonlyOrigin() {
    return html`
      <div class="origin-field-readonly">
        <label
          for="origin-link"
          class="field-label"
          data-l10n-id="login-item-origin-label"
        ></label>
        <a
          id="origin-link"
          class="origin-input"
          dir="auto"
          target="_blank"
          rel="noreferrer"
          href=${this.originValue}
          @click=${this.onOriginClick}
        >
          ${this.originValue}
        </a>
      </div>
    `;
  }

  #handleKeyPressOnLastButton(mozButtonGroup) {
    const handleKeyPress = e => {
      if (e.key !== "Tab") {
        return;
      }

      const notifMsgBar = this.parentElement.querySelector(
        "notification-message-bar"
      );

      if (!notifMsgBar) {
        return;
      }

      e.preventDefault();

      const mozMsgBar = notifMsgBar.shadowRoot.querySelector("moz-message-bar");
      const mozButtonGroup = mozMsgBar.querySelector("moz-button-group");

      if (mozButtonGroup) {
        const firstSlot = mozButtonGroup.shadowRoot.querySelector("slot");
        const firstButton = firstSlot.assignedElements()[0];
        firstButton.focus();
        return;
      }

      const primaryActionButton = mozMsgBar.querySelector("#primary-action");
      primaryActionButton.focus();
    };

    const slots = mozButtonGroup.shadowRoot.querySelectorAll("slot");
    const lastSlot = slots[slots.length - 1];
    const lastButton = lastSlot.assignedElements()[0];
    lastButton.addEventListener("keydown", e => handleKeyPress(e));
  }

  #removeWarning(warning) {
    if (warning.classList.contains("invalid-input")) {
      warning.classList.remove("invalid-input");
    }
  }

  #shouldShowWarning(field, warning) {
    const input = field.inputEl;
    input.required = true;
    const fieldInvalid =
      warning === this.originWarning
        ? this._originInvalid
        : this._passwordInvalid;

    if (!input.checkValidity() || fieldInvalid) {
      // FIXME: for some reason checkValidity does not apply the :invalid style
      // to the field. For now, we reset the input value to "" apply :invalid
      // styling.
      field.value = "";
      input.value = "";

      input.focus();
      warning.setAttribute("message", input.validationMessage);
      warning.classList.add("invalid-input");
      input.setAttribute("aria-describedby", warning.id);
      if (warning === this.originWarning) {
        this._originInvalid = true;
      } else if (warning === this.passwordWarning) {
        this._passwordInvalid = true;
      }
      return true;
    }

    input.removeAttribute("aria-describedby");
    this.#removeWarning(warning);
    if (warning === this.originWarning) {
      this._originInvalid = false;
    } else if (warning === this.passwordWarning) {
      this._passwordInvalid = false;
    }
    return false;
  }

  onInput(e) {
    const field = e.target;
    const warning =
      field.name === "origin" ? this.originWarning : this.passwordWarning;
    field.inputEl.required = true;
    const isValid = field.inputEl.checkValidity();

    if (isValid) {
      this.#removeWarning(warning);
      field.inputEl.removeAttribute("aria-describedby");
    }

    if (field.name === "origin") {
      this._originInvalid = !isValid;
    } else if (field.name === "password") {
      this._passwordInvalid = !isValid;
    }
  }

  onCancel(e) {
    e.preventDefault();

    const loginFromForm = {
      origin: this.originValue || this.originField?.value,
      username: this.usernameField.value.trim(),
      password: this.passwordField.value,
    };
    this.onClose(loginFromForm);
  }

  onSubmit(e) {
    e.preventDefault();

    if (!this.#isFormValid()) {
      return;
    }

    const loginFromForm = {
      origin: this.originValue || this.originField?.value,
      username: this.usernameField.value.trim(),
      password: this.passwordField.value,
    };
    this.onSaveClick(loginFromForm);
  }

  #isFormValid() {
    let originError = false;
    let passwordError = false;

    passwordError = this.#shouldShowWarning(
      this.passwordField,
      this.passwordWarning
    );

    if (this.type !== "edit") {
      originError = this.#shouldShowWarning(
        this.originField,
        this.originWarning
      );
    }

    if (passwordError || originError) {
      return false;
    }

    return true;
  }

  #toggleDeleteCard() {
    this._showDeleteCard = !this._showDeleteCard;
  }

  #renderDeleteCard() {
    const getIconSrc = () => {
      return document.dir === "rtl"
        ? // eslint-disable-next-line mozilla/no-browser-refs-in-toolkit
          "chrome://browser/skin/forward.svg"
        : // eslint-disable-next-line mozilla/no-browser-refs-in-toolkit
          "chrome://browser/skin/back.svg";
    };

    return html` <link
        rel="stylesheet"
        href="chrome://global/content/megalist/components/login-form/login-form.css"
      />
      <moz-card class="remove-login-card">
        <div class="remove-card-back">
          <moz-button
            type="icon ghost"
            iconSrc=${getIconSrc()}
            data-l10n-id="contextual-manager-passwords-remove-login-card-back-message"
            @click=${this.#toggleDeleteCard}
          >
          </moz-button>
        </div>
        <div class="remove-card-text">
          <h3
            data-l10n-id="contextual-manager-passwords-remove-login-card-title"
          ></h3>
          <p
            data-l10n-id="contextual-manager-passwords-remove-login-card-message"
          ></p>
        </div>
        <moz-button-group>
          <moz-button
            data-l10n-id="contextual-manager-passwords-remove-login-card-cancel-button"
            @click=${this.#toggleDeleteCard}
          >
          </moz-button>
          <moz-button
            type="destructive"
            data-l10n-id="contextual-manager-passwords-remove-login-card-remove-button"
            @click=${this.onDeleteClick}
          >
          </moz-button>
        </moz-button-group>
      </moz-card>`;
  }

  render() {
    if (this._showDeleteCard) {
      return this.#renderDeleteCard();
    }

    const heading =
      this.type !== "edit"
        ? "contextual-manager-passwords-create-label"
        : "contextual-manager-passwords-update-label";

    return html`<link
        rel="stylesheet"
        href="chrome://global/content/megalist/components/login-form/login-form.css"
      />
      <moz-card>
        ${when(
          this.type === "edit",
          () => html`
            <div class="delete-login-button-container">
              <moz-button
                class="delete-login-button"
                data-l10n-id="contextual-manager-passwords-remove-label"
                type="icon"
                iconSrc="chrome://global/skin/icons/delete.svg"
                @click=${this.#toggleDeleteCard}
              ></moz-button>
            </div>
          `
        )}

        <form
          role="region"
          aria-labelledby="moz-fieldset-id"
          @submit=${e => this.onSubmit(e)}
        >
          <moz-fieldset id="moz-fieldset-id" data-l10n-id=${heading}>
            ${this.type === "edit"
              ? this.#renderReadonlyOrigin()
              : html`
                  <div class="field-container">
                    <moz-input-url
                      name="origin"
                      aria-describedby="origin-description"
                      data-l10n-id="contextual-manager-passwords-origin-field"
                      .value=${this.originValue}
                      @input=${e => this.onInput(e)}
                      @change=${() => this.#addHTTPSPrefix()}
                    ></moz-input-url>
                    <p
                      id="origin-description"
                      role="note"
                      class="field-description"
                      data-l10n-id="contextual-manager-passwords-origin-field-description"
                    ></p>
                    <origin-warning
                      id="origin-alert"
                      role="alert"
                      arrowdirection="down"
                    ></origin-warning>
                  </div>
                `}
            <div class="field-container">
              <moz-input-text
                name="username"
                aria-describedby="username-description"
                data-l10n-id="contextual-manager-passwords-username-field"
                .value=${this.usernameValue}
              ></moz-input-text>
              <p
                id="username-description"
                role="note"
                class="field-description"
                data-l10n-id="contextual-manager-passwords-username-field-description"
              ></p>
            </div>
            <div class="field-container">
              <moz-input-password
                name="password"
                aria-describedby="password-description"
                data-l10n-id="contextual-manager-passwords-password-field"
                .value=${this.passwordValue}
                @input=${e => this.onInput(e)}
                @focusin=${() => this.#revealPassword()}
                @focusout=${() => this.#concealPassword()}
              ></moz-input-password>
              <p
                id="password-description"
                role="note"
                class="field-description"
                data-l10n-id="contextual-manager-passwords-password-field-description"
              ></p>
              <password-warning
                id="password-alert"
                role="alert"
                isNewLogin
                arrowdirection="down"
              ></password-warning>
            </div>
            <moz-button-group>
              <moz-button
                data-l10n-id="login-item-cancel-button"
                @click=${this.onCancel}
              ></moz-button>
              <moz-button
                data-l10n-id="login-item-save-new-button"
                type="primary"
                @click=${() => this.formEl.requestSubmit()}
              >
              </moz-button>
            </moz-button-group>
          </moz-fieldset>
        </form>
      </moz-card>`;
  }
}

customElements.define("login-form", LoginForm);
