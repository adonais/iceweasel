/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import {
  defaultMarkdownParser,
  DOMSerializer,
} from "chrome://browser/content/multilineeditor/prosemirror.bundle.mjs";

const SERIALIZER = DOMSerializer.fromSchema(defaultMarkdownParser.schema);

// eslint-disable-next-line import/no-unassigned-import
import "chrome://browser/content/aiwindow/components/ai-chat-search-button.mjs";

/**
 * A custom element for managing AI Chat Content
 */
export class AIChatMessage extends MozLitElement {
  #lastMessage = null;
  #lastMessageElement = "";
  #lastTrustedUrlsRef = null;

  /**
   * Built from trustedUrls array in willUpdate().
   *
   * @type {Set<string>}
   */
  #trustedUrlSet = new Set();

  static properties = {
    role: { type: String }, // "user" | "assistant"
    message: { type: String },
    messageId: { type: String, reflect: true, attribute: "data-message-id" },
    searchTokens: { type: Array },
    /**
     * Trusted URLs for link validation, pushed from parent via ai-chat-content.
     * Array type for Xray wrapper compatibility.
     * Converted to internal Set in willUpdate().
     */
    trustedUrls: { type: Array, attribute: false },
  };

  constructor() {
    super();
    this.searchTokens = [];
    this.trustedUrls = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener(
      "AIWindow:chat-search",
      this.handleSearchHandoffEvent.bind(this)
    );
    this.#initLinkNavigationListener();
  }

  #initLinkNavigationListener() {
    this.shadowRoot.addEventListener("click", event => {
      let target = event.target;
      while (target && target !== this.shadowRoot) {
        if (target.tagName === "A" && target.href) {
          event.preventDefault();
          this.dispatchEvent(
            new CustomEvent("AIChatContent:OpenLink", {
              bubbles: true,
              composed: true,
              detail: { url: target.href },
            })
          );
          return;
        }
        target = target.parentElement;
      }
    });
  }

  /**
   * Lit lifecycle hook called before each render.
   * Converts trustedUrls array to internal Set.
   *
   * @param {Map} changed - Map of changed properties with previous values
   */
  willUpdate(changed) {
    super.willUpdate?.(changed);
    // Rebuild Set if trustedUrls changed, OR if Set is empty but array has values
    // (handles case where trustedUrls was set before Lit started tracking)
    if (
      changed.has("trustedUrls") ||
      (this.#trustedUrlSet.size === 0 && this.trustedUrls?.length > 0)
    ) {
      const list = Array.isArray(this.trustedUrls) ? this.trustedUrls : [];
      this.#trustedUrlSet = new Set(list);
    }
  }

  /**
   * Handle search handoff events
   *
   * @param {CustomEvent} event - The custom event containing the search query.
   */
  handleSearchHandoffEvent(event) {
    const e = new CustomEvent("AIChatContent:DispatchSearch", {
      detail: event.detail,
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(e);
  }

  #getIconSrc = linkHref => {
    // Since we use the "page-icon:" CSP rule we can just look at the page URL for the img src
    const finalIcon = linkHref
      ? `page-icon:${linkHref}`
      : "chrome://global/skin/icons/defaultFavicon.svg";
    return finalIcon;
  };

  /**
   * Checks if a URL is trusted for enabling as a clickable link.
   *
   * Fail-closed: returns false for invalid URLs or if trustedUrls
   * is not available.
   *
   * @param {URL} url - The parsed/normalized URL to check
   * @returns {boolean} True if the URL is trusted, false otherwise
   */
  #isTrustedUrl(url) {
    if (!url) {
      return false;
    }
    return this.#trustedUrlSet.has(url.href);
  }

  /**
   * Replaces "website mention" markdown links rendered as anchors with an
   * <ai-website-chip> custom element.
   *
   * Example markdown that produces such an anchor:
   *
   *   Look up [@Google](
   *     mention:?href=https%3A%2F%2Fwww.google.com
   *   )
   *
   * After ProseMirror renders the markdown, this method transforms:
   *
   *   <a href="mention:?...">@Google</a>
   *
   * into:
   *
   *   <ai-website-chip type="in-line" ...></ai-website-chip>
   *
   *
   * `mention:?` is intentional: the substring after it is a query string.
   * This lets us detect mention anchors and parse href but in the future additional params
   * for example type or src via `URLSearchParams`.
   *
   * @param {Element} root
   *   Root element that already contains sanitized HTML for the message
   *   (i.e., after `setHTML()` has inserted the ProseMirror-rendered output).
   */
  #replaceWebsiteMentions(root) {
    const MAX_URL_LENGTH = 2048;
    const MENTION_PREFIX = "mention:?";
    const links = root.querySelectorAll(`a[href^="${MENTION_PREFIX}"]`);

    for (const a of links) {
      const { href } = a;

      if (!href.startsWith(MENTION_PREFIX)) {
        continue;
      }

      const params = new URLSearchParams(href.substring(MENTION_PREFIX.length));

      // Build Data
      const linkHref = params.get("href") || "";

      if (!linkHref || linkHref.length > MAX_URL_LENGTH) {
        // TODO - https://bugzilla.mozilla.org/show_bug.cgi?id=2011538
        continue;
      }

      const label = a.textContent || linkHref;
      const iconSrc = this.#getIconSrc(linkHref);

      // Create Website Chip
      const chip = root.ownerDocument.createElement("ai-website-chip");
      chip.type = "in-line";
      chip.label = label;
      chip.iconSrc = iconSrc;
      chip.href = linkHref;

      a.replaceWith(chip);
    }
  }

  /**
   * Processes http/https links for security validation.
   *
   * For each anchor:
   * - If trusted: strips fragment and enables href (clickable)
   * - If not trusted: removes href (not clickable)
   * - Non-http(s) schemes: removes href entirely
   *
   * Fragments are stripped from enabled links to prevent fragment-based
   * data exfiltration via prompt injection. Links are normalized
   * without fragments so "example.com/page#section" matches trusted
   * "example.com/page".
   *
   * This is fail-closed: links are only clickable if explicitly trusted.
   *
   * @param {Element} root - The element containing rendered markdown
   */
  #processLinks(root) {
    // Security validation is not active if null
    // i.e., browser.smartwindow.checkSecurityFlags is disabled
    if (this.trustedUrls === null) {
      return;
    }

    const anchors = root.querySelectorAll("a[href]");
    for (const anchor of anchors) {
      const parsed = URL.parse(anchor.href);

      const isHttpUrl =
        parsed?.protocol === "http:" || parsed?.protocol === "https:";

      if (isHttpUrl) {
        parsed.hash = "";
      }
      const isAllowed = isHttpUrl && this.#isTrustedUrl(parsed);

      if (!isAllowed) {
        anchor.removeAttribute("href");
      } else {
        // Apply fragment-free URL to prevent data exfiltration.
        // TODO Bug 2022066: Allow fragments when full URL+fragment matches ledger.
        anchor.href = parsed.href;
      }
    }
  }

  /**
   * Parse markdown content to HTML using ProseMirror
   *
   * @param {string} markdown the Markdown to parse
   * @param {Element} element the element in which to insert the parsed markdown.
   */
  parseMarkdown(markdown, element) {
    const node = defaultMarkdownParser.parse(markdown);
    const fragment = SERIALIZER.serializeFragment(node.content);

    // Convert DocumentFragment to HTML string
    const container = this.ownerDocument.createElement("div");
    container.appendChild(fragment);

    // Sanitize the HTML string by using "setHTML"
    element.setHTML(container.innerHTML);
  }

  /**
   * Parse markdown and replace mentions for user messages
   *
   * @param {string} markdown
   * @param {Element} element
   */
  parseUserMarkdown(markdown, element) {
    this.parseMarkdown(markdown, element);
    this.#replaceWebsiteMentions(element);
  }

  /**
   * Ensure our message element is up to date. This gets called from
   * render and memoizes based on `this.message` and `this.trustedUrls`
   * to avoid unnecessary re-renders while still updating when trust changes.
   *
   * @returns {Element} HTML element containing the parsed markdown
   */
  getAssistantMessage() {
    // Re-render if message changed OR trustedUrls reference changed
    if (
      this.message == this.#lastMessage &&
      this.trustedUrls === this.#lastTrustedUrlsRef
    ) {
      return this.#lastMessageElement;
    }

    let messageElement = this.ownerDocument.createElement("div");
    messageElement.className = "message-" + this.role;
    if (!this.message) {
      this.#lastMessage = this.message;
      this.#lastMessageElement = messageElement;
      this.#lastTrustedUrlsRef = this.trustedUrls;
      return messageElement;
    }

    this.parseMarkdown(this.message, messageElement);
    this.#processLinks(messageElement);

    this.#lastMessage = this.message;
    this.#lastMessageElement = messageElement;
    this.#lastTrustedUrlsRef = this.trustedUrls;

    return messageElement;
  }

  getUserMessage() {
    const messageElement = this.ownerDocument.createElement("div");
    messageElement.className = "message-" + this.role;

    if (!this.message) {
      return messageElement;
    }

    this.parseUserMarkdown(this.message, messageElement);

    return messageElement;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/ai-chat-message.css"
      />

      <article>
        ${this.role === "user"
          ? this.getUserMessage()
          : this.getAssistantMessage()}
        ${this.role === "assistant"
          ? html`${this.searchTokens.map(
              token =>
                html`<ai-chat-search-button
                  .query=${token}
                  .label=${token}
                ></ai-chat-search-button>`
            )}`
          : null}
      </article>
    `;
  }
}

customElements.define("ai-chat-message", AIChatMessage);
