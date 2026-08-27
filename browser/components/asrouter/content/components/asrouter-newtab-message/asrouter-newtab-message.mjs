/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This component participates in newtab train-hopping and is packaged into the
// newtab folder at build-time, so chrome://newtab refs are intentional here.
/* eslint-disable mozilla/no-newtab-refs-outside-newtab */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

const DEFAULT_CSS =
  "chrome://newtab/content/data/content/external-components/asrouter-newtab-message/asrouter-newtab-message.css";

// Polling cadence for re-evaluating the message's declarative `content.states`
// targeting while the message is visible.
const POLL_INTERVAL_MS = 3000;

// Action types that, when present on a button's `action`, are dispatched
// directly into New Tab's Redux store via the injected `dispatch` instead
// of being forwarded to SpecialMessageActions in the parent process. This
// is a deliberate, narrow boundary crossing — only the types listed here
// are allowed to reach into HNT internals. Long-term, these should migrate
// to a stable train-hop-compatible SpecialMessageActions API.
const NEWTAB_DISPATCH_ACTION_TYPES = new Set(["WIDGETS_OPT_IN"]);

export default class ASRouterNewTabMessage extends MozLitElement {
  static properties = {
    messageData: { type: Object },
    cssOverride: { type: String },

    /**
     * These are injected by New Tab's MessageWrapper component, and should
     * be called in order to do message management operations. See the
     * README.md for this component for more details.
     */
    handleDismiss: { type: Function },
    handleClick: { type: Function },
    handleBlock: { type: Function },
    handleClose: { type: Function },
    isIntersecting: { type: Boolean },

    /**
     * Injected by New Tab's MessageWrapper. When a button's action type is
     * in `NEWTAB_DISPATCH_ACTION_TYPES`, the action is forwarded to this
     * dispatch instead of going through SpecialMessageActions.
     */
    dispatch: { type: Function },

    /**
     * Internal reactive state holding the content overlay from the first
     * `content.states` entry whose `targeting` currently matches, or null when
     * none match (base content). Re-evaluated when the message scrolls into
     * view, when the tab becomes visible, and on a recurring poll.
     */
    _matchedContent: { state: true },
  };

  #pollTimer = null;
  #onVisibilityChange = null;
  #reachedFinalState = false;

  connectedCallback() {
    super.connectedCallback();
    if (!this.messageData?.content?.states?.length) {
      return;
    }

    this.#onVisibilityChange = () => this.#evaluateStates();
    this.ownerDocument.addEventListener(
      "visibilitychange",
      this.#onVisibilityChange
    );
    this.#startPolling();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#teardownTriggers();
  }

  /**
   * isIntersecting is set by the newtab MessageWrapper after its
   * IntersectionObserver fires, which can land after connectedCallback, so
   * evaluating here - rather than eagerly in connectedCallback - makes the
   * first evaluation deterministic instead of racing that prop.
   *
   * @param {Map} changedProperties
   */
  updated(changedProperties) {
    if (changedProperties.has("isIntersecting") && this.isIntersecting) {
      this.#evaluateStates();
    }
  }

  #teardownTriggers() {
    this.#stopPolling();
    if (this.#onVisibilityChange) {
      this.ownerDocument.removeEventListener(
        "visibilitychange",
        this.#onVisibilityChange
      );
      this.#onVisibilityChange = null;
    }
  }

  #startPolling() {
    if (this.#pollTimer) {
      return;
    }
    this.#pollTimer = globalThis.setInterval(
      () => this.#evaluateStates(),
      POLL_INTERVAL_MS
    );
  }

  #stopPolling() {
    if (this.#pollTimer) {
      globalThis.clearInterval(this.#pollTimer);
      this.#pollTimer = null;
    }
  }

  /**
   * Ask the parent to evaluate every `content.states` entry's `targeting` (in
   * one round-trip) and swap in the first matching entry's content overlay.
   * States are evaluated in order, so list them most- to least-specific.
   * Skipped until the message has scrolled into view, while the tab is
   * backgrounded, and once a `final` state has been reached. The result is
   * applied asynchronously via setMatchedState().
   */
  #evaluateStates() {
    if (this.#reachedFinalState) {
      return;
    }
    const states = this.messageData?.content?.states;
    if (!states?.length) {
      return;
    }
    if (
      this.ownerDocument.visibilityState !== "visible" ||
      !this.isIntersecting
    ) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("ASRouterNewTabMessage:EvaluateTargeting", {
        bubbles: true,
        detail: { targetings: states.map(state => state.targeting) },
      })
    );
  }

  /**
   * Called by ASRouterNewTabMessageChild with the index of the first
   * `content.states` entry whose targeting matched (or -1 for none), selecting
   * the content overlay applied by #currentContent().
   *
   * @param {number} index
   */
  setMatchedState(index) {
    if (this.#reachedFinalState) {
      return;
    }

    const states = this.messageData?.content?.states ?? [];
    const matched = index >= 0 ? states[index] : null;
    this._matchedContent = matched?.content ?? null;
    // A state can opt out of all further re-evaluation once reached (e.g. a
    // terminal "completed" state), so a finished message stops polling and
    // stops reacting to visibility changes rather than being able to bounce
    // back out of the final state.
    if (matched?.final) {
      this.#reachedFinalState = true;
      this.#teardownTriggers();
    }
  }

  /**
   * Returns the effective content, overlaying the matched state's content (see
   * #evaluateStates / setMatchedState). Used by both render() and the button
   * handlers so the displayed UI and the action it triggers stay in sync.
   *
   * @returns {object} The (possibly overlaid) content.
   */
  #currentContent() {
    const content = this.messageData?.content ?? {};
    return this._matchedContent
      ? { ...content, ...this._matchedContent }
      : content;
  }

  /**
   * Executes a SpecialMessageAction by dispatching an event that will be caught
   * by the ASRouterNewTabMessage JSWindowActor pair and forwarded to
   * SpecialMessageActions.handleAction() in the parent process.
   *
   * @param {object} action - The action object to execute
   * @param {string} action.type - The action type (e.g., "OPEN_URL", "OPEN_SIDEBAR")
   * @param {*} action.data - Action-specific data
   *
   * @example
   * this.specialMessageAction({
   *   type: "OPEN_SIDEBAR",
   *   data: "viewGenaiChatSidebar"
   * });
   */
  specialMessageAction(action) {
    // Actions whose type is in the allowlist are dispatched directly into
    // New Tab's Redux store via the injected `dispatch`. Everything else
    // flows through the JSWindowActor pair to SpecialMessageActions in the
    // parent process.
    if (NEWTAB_DISPATCH_ACTION_TYPES.has(action?.type) && this.dispatch) {
      this.dispatch(action);
      return;
    }
    this.dispatchEvent(
      new CustomEvent("ASRouterNewTabMessage:SpecialMessageAction", {
        bubbles: true,
        detail: {
          action,
        },
      })
    );
  }

  #handleXButton() {
    this.handleBlock?.();
    this.#handleDismiss();
  }

  #handleDismiss() {
    this.handleDismiss?.();
  }

  #handlePrimaryButton() {
    const { primaryButton } = this.#currentContent();
    this.handleClick?.("primary-button");
    if (primaryButton?.action?.type) {
      this.specialMessageAction(primaryButton.action);
    }
    if (primaryButton?.action?.dismiss) {
      this.#handleDismiss();
    }
  }

  #handleSecondaryButton() {
    const { secondaryButton } = this.#currentContent();
    this.handleClick?.("secondary-button");
    if (secondaryButton?.action?.type) {
      this.specialMessageAction(secondaryButton.action);
    }
    if (secondaryButton?.action?.dismiss) {
      this.#handleDismiss();
    }
  }

  #renderHeading(value) {
    if (!value) {
      return nothing;
    }
    if (typeof value === "string") {
      return html`<h2 id="asrouter-newtab-message-heading">${value}</h2>`;
    }
    return html`<h2
      id="asrouter-newtab-message-heading"
      data-l10n-id=${value.string_id}
    ></h2>`;
  }

  #renderBody(value) {
    if (!value) {
      return nothing;
    }
    if (typeof value === "string") {
      return html`<p>${value}</p>`;
    }
    return html`<p data-l10n-id=${value.string_id}></p>`;
  }

  #renderSecondaryButton(secondaryButton) {
    if (!secondaryButton) {
      return nothing;
    }
    // Each button's moz-button `type` can be overridden from content (e.g. so a
    // step-style message can render both buttons non-primary); defaults keep
    // the primary/secondary styling.
    const type = secondaryButton.type ?? "default";
    return typeof secondaryButton.label === "string"
      ? html`<moz-button
          type=${type}
          @click=${this.#handleSecondaryButton.bind(this)}
          >${secondaryButton.label}</moz-button
        >`
      : html`<moz-button
          type=${type}
          @click=${this.#handleSecondaryButton.bind(this)}
          data-l10n-id=${secondaryButton.label.string_id}
        ></moz-button>`;
  }

  #renderPrimaryButtonContent(primaryButton) {
    if (!primaryButton) {
      return nothing;
    }
    const type = primaryButton.type ?? "primary";
    if (typeof primaryButton.label === "string") {
      return html`<moz-button
        type=${type}
        iconSrc=${primaryButton.iconSrc || nothing}
        @click=${this.#handlePrimaryButton.bind(this)}
        >${primaryButton.label}</moz-button
      >`;
    }
    return html`<moz-button
      type=${type}
      iconSrc=${primaryButton.iconSrc || nothing}
      @click=${this.#handlePrimaryButton.bind(this)}
      data-l10n-id=${primaryButton.label.string_id}
    ></moz-button>`;
  }

  /**
   * Whether the message supplies alternate image variants (narrow and/or
   * responsive). This opts the message into the flush image treatment: a
   * full-bleed banner in the narrow (vertical) layout and a full-height,
   * flush image column in the medium and wide layouts.
   *
   * @param {object} content - The message content object.
   * @returns {boolean}
   */
  #hasResponsiveImage(content) {
    return Boolean(
      content?.imageSrcResponsive ||
      content?.imageSrcDarkResponsive ||
      content?.imageSrcNarrow ||
      content?.imageSrcDarkNarrow
    );
  }

  /**
   * Renders the message image. When only `imageSrc` is provided it renders a
   * single light-mode image sized as a fixed thumbnail. When alternate variants
   * are supplied, it renders a <picture> that swaps the source based on color
   * scheme and viewport width across three tiers, matching the layout
   * breakpoints in the stylesheet:
   *   - responsive banner below 724px,
   *   - narrow (portrait) column between 724px and 1072px,
   *   - base image column at/above 1072px (also the <img> fallback).
   * Dark-scheme sources are listed before the scheme-agnostic light sources so
   * the first matching <source> wins correctly in either color scheme. The
   * flush treatment is driven by the `has-responsive-image` class on the host
   * <aside> (see `#hasResponsiveImage`).
   *
   * @param {object} content - The message content object.
   */
  #renderImage(content) {
    const imageSrc = content?.imageSrc;
    if (!imageSrc) {
      return nothing;
    }
    const {
      imageSrcDark,
      imageSrcNarrow,
      imageSrcDarkNarrow,
      imageSrcResponsive,
      imageSrcDarkResponsive,
    } = content;
    return html`<picture class="message-image">
      ${imageSrcDark
        ? html`<source
            srcset=${imageSrcDark}
            media="(min-width: 1072px) and (prefers-color-scheme: dark)"
          />`
        : nothing}
      ${imageSrcDarkNarrow
        ? html`<source
            srcset=${imageSrcDarkNarrow}
            media="(min-width: 724px) and (max-width: 1071.98px) and (prefers-color-scheme: dark)"
          />`
        : nothing}
      ${imageSrcDarkResponsive
        ? html`<source
            srcset=${imageSrcDarkResponsive}
            media="(max-width: 723.98px) and (prefers-color-scheme: dark)"
          />`
        : nothing}
      ${imageSrcNarrow
        ? html`<source
            srcset=${imageSrcNarrow}
            media="(min-width: 724px) and (max-width: 1071.98px)"
          />`
        : nothing}
      ${imageSrcResponsive
        ? html`<source
            srcset=${imageSrcResponsive}
            media="(max-width: 723.98px)"
          />`
        : nothing}
      <img src=${imageSrc} alt="" />
    </picture>`;
  }

  #renderPrimaryButton(primaryButton, secondaryButton) {
    if (!primaryButton && !secondaryButton) {
      return nothing;
    }
    return html`<moz-button-group class="button-group">
      ${this.#renderPrimaryButtonContent(primaryButton)}
      ${this.#renderSecondaryButton(secondaryButton)}
    </moz-button-group>`;
  }

  render() {
    const content = this.#currentContent();
    const CSS_HREF = this.cssOverride || DEFAULT_CSS;
    return html`
      <link rel="stylesheet" href=${CSS_HREF} />
      <aside
        class=${[
          "asrouter-newtab-message",
          content?.hideDismissButton ? "no-dismiss" : "",
          this.#hasResponsiveImage(content) ? "has-responsive-image" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-labelledby=${content?.heading
          ? "asrouter-newtab-message-heading"
          : nothing}
      >
        ${content?.hideDismissButton
          ? nothing
          : html`<div class="dismiss-button">
              <moz-button
                type="icon ghost"
                size="small"
                iconSrc="chrome://global/skin/icons/close.svg"
                data-l10n-id="newtab-activation-window-message-dismiss-button"
                @click=${this.#handleXButton.bind(this)}
              ></moz-button>
            </div>`}
        <div class="message-inner">
          ${this.#renderImage(content)}
          <div class="message-content">
            ${this.#renderHeading(content?.heading)}
            ${this.#renderBody(content?.body)}
            ${this.#renderPrimaryButton(
              content?.primaryButton,
              content?.secondaryButton
            )}
          </div>
        </div>
      </aside>
    `;
  }
}

customElements.define("asrouter-newtab-message", ASRouterNewTabMessage);
