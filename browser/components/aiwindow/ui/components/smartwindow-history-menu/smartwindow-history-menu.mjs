/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, styleMap } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/panel-list.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";

const HISTORY_MENU_ID = "history-menu";
const FULLPAGE_CHATS_MENU_ID = "fullpage-chats-menu";
const FULLPAGE_MORE_MENU_ID = "fullpage-more-menu";

/**
 * @typedef {{ id: string, title: string, pageUrl: ?string }} RecentChat
 */

/**
 * The Smart Window chat history entry point: a "..." menu in the sidebar, and a
 * labeled New chat / Chat history / More row in fullpage.
 *
 * Presentational only. Recent chats arrive via `recentChats`; actions are
 * dispatched as `smartwindow-history-menu:*` events for the host to handle:
 * new-chat, open-chat (detail `{ conversationId }`), view-all-chats,
 * open-settings, and request-recent-chats (asks the host to refresh
 * `recentChats`).
 *
 * @property {"sidebar"|"fullpage"} mode - Layout to render.
 * @property {RecentChat[]} recentChats - Recent conversations to list.
 */
export class SmartwindowHistoryMenu extends MozLitElement {
  static properties = {
    mode: { type: String, reflect: true },
    recentChats: { type: Array },
    view: { type: String, state: true },
  };

  constructor() {
    super();
    this.mode = "sidebar";
    this.recentChats = [];
    this.view = "main";
  }

  #dispatch(type, detail) {
    this.dispatchEvent(
      new CustomEvent(`smartwindow-history-menu:${type}`, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  #requestRecentChats = () => this.#dispatch("request-recent-chats");

  #onNewChat = () => this.#dispatch("new-chat");

  #onViewAllChats = () => this.#dispatch("view-all-chats");

  #onOpenSettings = () => this.#dispatch("open-settings");

  #onOpenChat(conversationId) {
    this.#dispatch("open-chat", { conversationId });
  }

  // Reset to the main view and refresh on open.
  #onSidebarMenuShown = () => {
    this.view = "main";
    this.#requestRecentChats();
  };

  // stopPropagation keeps the panel open (item clicks otherwise close it).
  #onChatHistoryNavClick(event) {
    event.stopPropagation();
    this.#requestRecentChats();
    this.view = "chats";
  }

  #onBackClick(event) {
    event.stopPropagation();
    this.view = "main";
  }

  /**
   * @param {RecentChat} chat
   */
  #recentChatRowTemplate(chat) {
    const hasExternalUrl = chat.pageUrl && !chat.pageUrl.startsWith("about:");
    const iconUrl = hasExternalUrl
      ? `page-icon:${chat.pageUrl}`
      : "chrome://browser/content/firefoxview/view-chats.svg";

    return html`<panel-item
      icon
      class="history-menu-chat ${hasExternalUrl ? "chat-overlay" : ""}"
      style=${styleMap({ "--panel-item-icon-url": `url("${iconUrl}")` })}
      @click=${() => this.#onOpenChat(chat.id)}
      >${chat.title}</panel-item
    >`;
  }

  #recentChatsListTemplate() {
    return html`
      ${this.recentChats.map(chat => this.#recentChatRowTemplate(chat))}
      ${this.recentChats.length ? html`<hr />` : ""}
      <panel-item
        icon
        style=${styleMap({
          "--panel-item-icon-url": "url('chrome://browser/skin/history.svg')",
        })}
        data-l10n-id="aiwindow-history-menu-view-all-chats"
        @click=${this.#onViewAllChats}
      ></panel-item>
    `;
  }

  #mainViewTemplate() {
    return html`
      <panel-item
        class="history-menu-nav"
        data-l10n-id="aiwindow-history-menu-chat-history"
        @click=${this.#onChatHistoryNavClick}
      ></panel-item>
      <panel-item
        data-l10n-id="aiwindow-history-menu-settings"
        @click=${this.#onOpenSettings}
      ></panel-item>
    `;
  }

  #chatHistoryViewTemplate() {
    return html`
      <div class="history-menu-header">
        <moz-button
          class="history-menu-back"
          type="ghost icon"
          iconsrc="chrome://global/skin/icons/arrow-left.svg"
          data-l10n-id="aiwindow-history-menu-back"
          data-l10n-attrs="tooltiptext,aria-label"
          @click=${this.#onBackClick}
        ></moz-button>
        <span
          class="history-menu-header-title"
          data-l10n-id="aiwindow-history-menu-chat-history"
        ></span>
      </div>
      <hr />
      ${this.#recentChatsListTemplate()}
    `;
  }

  #sidebarTemplate() {
    return html`
      <moz-button
        data-l10n-id="aiwindow-history-menu"
        data-l10n-attrs="tooltiptext,aria-label"
        class="history-menu-button"
        type="ghost icon"
        iconsrc="chrome://global/skin/icons/more.svg"
        .menuId=${HISTORY_MENU_ID}
      ></moz-button>
      <panel-list
        id=${HISTORY_MENU_ID}
        class="history-menu"
        @shown=${this.#onSidebarMenuShown}
      >
        ${this.view === "chats"
          ? this.#chatHistoryViewTemplate()
          : this.#mainViewTemplate()}
      </panel-list>
    `;
  }

  #fullpageTemplate() {
    return html`
      <moz-button
        class="fullpage-action-button"
        type="ghost"
        size="small"
        iconsrc="chrome://browser/content/aiwindow/assets/new-chat.svg"
        data-l10n-id="aiwindow-fullpage-new-chat"
        @click=${this.#onNewChat}
      ></moz-button>
      <moz-button
        class="fullpage-action-button"
        type="ghost"
        size="small"
        iconsrc="chrome://browser/skin/history.svg"
        data-l10n-id="aiwindow-fullpage-chat-history"
        .menuId=${FULLPAGE_CHATS_MENU_ID}
        @click=${this.#requestRecentChats}
      ></moz-button>
      <panel-list id=${FULLPAGE_CHATS_MENU_ID} class="history-menu">
        ${this.#recentChatsListTemplate()}
      </panel-list>
      <moz-button
        class="fullpage-action-button"
        type="ghost"
        size="small"
        iconsrc="chrome://global/skin/icons/more.svg"
        data-l10n-id="aiwindow-fullpage-more"
        .menuId=${FULLPAGE_MORE_MENU_ID}
      ></moz-button>
      <panel-list id=${FULLPAGE_MORE_MENU_ID} class="history-menu">
        <panel-item
          data-l10n-id="aiwindow-history-menu-settings"
          @click=${this.#onOpenSettings}
        ></panel-item>
      </panel-list>
    `;
  }

  render() {
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/aiwindow/components/smartwindow-history-menu.css"
      />
      ${this.mode === "fullpage"
        ? this.#fullpageTemplate()
        : this.#sidebarTemplate()}
    `;
  }
}

customElements.define("smartwindow-history-menu", SmartwindowHistoryMenu);
