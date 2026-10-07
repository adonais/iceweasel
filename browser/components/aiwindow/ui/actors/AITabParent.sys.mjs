/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AITabStore } from "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs";
import { ConversationStore } from "moz-src:///browser/components/aiwindow/ui/modules/ConversationStore.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AIWINDOW_URL:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs",
  URILoadingHelper: "resource:///modules/URILoadingHelper.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "fluentStrings", () => {
  return new Localization(["preview/aiWindow.ftl"], true);
});

const PAGE_NAME_REGEX = /^[\w-]+(\.html)?$/;

/**
 * Renders the eyebrow shown above a generated page's title.
 *
 * Formatting happens here rather than in the component because the strings
 * are localized in the parent and handed to content ready to display, the
 * same way the history grid passes its timestamps down.
 *
 * "Today" means the same calendar day in the local timezone, which is what a
 * reader means by it. A rolling 24 hour window would call late yesterday
 * today, and comparing timestamps directly would break either side of
 * midnight. `now` is a parameter so tests can pin the boundary rather than
 * racing the clock.
 *
 * @param {number} createdAt - aitab_pages.created_at, in microseconds.
 * @param {number} [now] - Milliseconds to treat as the current time.
 * @returns {string} Empty for a timestamp that is not a usable date.
 */
export function formatCreatedAt(createdAt, now = Date.now()) {
  // The store writes this column as `Date.now() * 1000`.
  const created = new Date(Math.round(createdAt / 1000));
  if (!createdAt || Number.isNaN(created.valueOf())) {
    return "";
  }

  if (created.toDateString() == new Date(now).toDateString()) {
    return lazy.fluentStrings.formatValueSync("aitab-created-today");
  }

  return lazy.fluentStrings.formatValueSync("aitab-created-on", {
    date: created.getTime(),
  });
}

/**
 * Parent actor for about:smartpage. Resolves the page name from the page URL
 * into the stored page config that content renders, and owns the destructive
 * actions the page offers.
 */
export class AITabParent extends JSWindowActorParent {
  async receiveMessage({ data, name }) {
    switch (name) {
      case "AITab:GetPage":
        return this.#handleGetPage();
      case "AITab:DeletePage":
        return this.#handleDeletePage();
      case "AITab:OpenLink":
        this.#handleOpenLink(data);
        return null;
      default:
        console.warn(`AITabParent received unknown message: ${name}`);
        return null;
    }
  }

  /**
   * The page this tab is showing, read from the tab's own URL rather than
   * taken from the child. Content is a lower-trust process, so a page name it
   * supplied could name a page other than the one on screen; anything
   * destructive would then act on the wrong one.
   *
   * @returns {?string} Null when the URL carries no usable page name.
   */
  get #pageName() {
    const spec = this.browsingContext?.currentURI?.spec;
    if (!spec) {
      return null;
    }

    const pageName = URL.parse(spec)?.searchParams.get("page");
    return pageName && PAGE_NAME_REGEX.test(pageName) ? pageName : null;
  }

  async #handleGetPage() {
    const pageName = this.#pageName;
    if (!pageName) {
      return { success: false, error: "Invalid page name" };
    }

    try {
      const page = await AITabStore.getBySlug(pageName);
      return {
        success: true,
        // Content renders the label as-is; it never sees the raw timestamp.
        page: page && {
          ...page,
          createdAtLabel: formatCreatedAt(page.createdAt),
        },
      };
    } catch (error) {
      console.error("Failed to retrieve AI Tab page:", error);
      return { success: false, error: "Failed to retrieve page" };
    }
  }

  /**
   * Deletes a generated page and the conversation that produced it. Every
   * page comes from its own conversation, so the two are removed together.
   *
   * They live in separate databases, so this cannot be one transaction. The
   * pages go first: a conversation with no pages is unreachable, while pages
   * that outlive their conversation would still load by slug.
   *
   * @returns {Promise<object>}
   */
  async #handleDeletePage() {
    const pageName = this.#pageName;
    if (!pageName) {
      return { success: false, error: "Invalid page name" };
    }

    try {
      const page = await AITabStore.getBySlug(pageName);

      // Deleting something already gone is not an error, but the tab still
      // gets sent home: a second tab open on the same page would otherwise be
      // stranded on the unavailable state with nowhere to go.
      if (page) {
        await AITabStore.deleteBySlug(page.slug);

        // The page is gone from here on. If clearing the conversation fails,
        // the delete the reader asked for still happened, so say so and log
        // the leftover rather than reporting a failure that did not happen.
        try {
          await ConversationStore.deleteConversationById(page.convId);
        } catch (error) {
          console.error(
            "Deleted an AI Tab page but could not delete its conversation",
            error
          );
        }
      }

      // Deferred so the reply reaches content before the tab navigates away.
      Services.tm.dispatchToMainThread(() => this.#returnToSmartWindowHome());

      return { success: true };
    } catch (error) {
      console.error("Could not delete an AI Tab page", error);
      return { success: false, error: "Could not delete the page" };
    }
  }

  /**
   * Opens a link from anywhere on a generated page. Kept separate from
   * AIChatContentParent's handler so AI Tab clicks stay out of chat's
   * recordUriLoad() metric.
   *
   * @param {object} data
   * @param {string} data.url
   * @param {boolean} [data.preferSwitchToTab]
   */
  #handleOpenLink({ url, preferSwitchToTab } = {}) {
    // Links come from model output, so only http and https are opened.
    // file:, data: and javascript: URLs are dropped, as is a missing or
    // unparseable url: URL.parse returns null for those.
    const uri = URL.parse(url);
    if (uri?.protocol != "http:" && uri?.protocol != "https:") {
      return;
    }

    const window = this.browsingContext?.topChromeWindow;
    if (!window) {
      return;
    }

    if (
      preferSwitchToTab &&
      lazy.URILoadingHelper.switchToTabHavingURI(window, url, false, {})
    ) {
      return;
    }

    const { userContextId } =
      window.gBrowser.selectedBrowser.browsingContext.originAttributes;
    lazy.URILoadingHelper.openWebLinkIn(window, url, "tab", {
      triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({
        userContextId,
      }),
      userContextId,
      forceForeground: false,
    });
  }

  /**
   * Sends the tab back to the Smart Window home page once its content has been
   * deleted, so the user is not left on a page that no longer exists.
   *
   * This has to run in the parent: the home page is a chrome: URL and
   * about:smartpage is content, which is not allowed to navigate itself there.
   */
  #returnToSmartWindowHome() {
    // about:smartpage is not MAKE_LINKABLE, so web content cannot load it at
    // all, framed or otherwise: this is always the tab's own top-level context.
    // The optional call covers the tab being closed mid-delete.
    this.browsingContext?.loadURI(Services.io.newURI(lazy.AIWINDOW_URL), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  }
}
