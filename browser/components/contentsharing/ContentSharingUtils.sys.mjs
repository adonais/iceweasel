/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  JsonSchema: "resource://gre/modules/JsonSchema.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "CONTENT_SHARING_ENABLED",
  "browser.contentsharing.enabled",
  false
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "CONTENT_SHARING_SERVER_URL",
  "browser.contentsharing.server.url",
  ""
);

const SCHEMA_MAP = new Map();
async function loadContentSharingSchema() {
  if (SCHEMA_MAP.has("CONTENT_SHARING_SCHEMA")) {
    return SCHEMA_MAP.get("CONTENT_SHARING_SCHEMA");
  }

  const url =
    "chrome://browser/content/contentsharing/contentsharing.schema.json";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load schema: ${response.statusText}`);
  }

  const schema = await response.json();
  SCHEMA_MAP.set("CONTENT_SHARING_SCHEMA", schema);
  return schema;
}

/**
 * Class for interacting with Content Sharing features, such as sharing bookmarks, tab groups, and tabs.
 */
class ContentSharingUtilsClass {
  #validator = null;

  get isEnabled() {
    return lazy.CONTENT_SHARING_ENABLED;
  }

  get serverURL() {
    return lazy.CONTENT_SHARING_SERVER_URL;
  }

  async getValidator() {
    if (this.#validator) {
      return this.#validator;
    }

    const schema = await loadContentSharingSchema();
    this.#validator = new lazy.JsonSchema.Validator(schema);
    return this.#validator;
  }

  /**
   * Handles sharing bookmarks by building a share object and sending it to the
   * content sharing server to get a shareable link, which is then opened in a
   * new tab. bookmarkFolderGuids can be 1 or more bookmark folder guids. If
   * more than 1, the first guid will be treated as the parent folder and the
   * rest will be nested inside it.
   *
   * @param {Array<string>} bookmarkFolderGuids An array of bookmark folder guids
   * @param {Window} window The window to open the share URL in
   */
  async createShareableLinkFromBookmarkFolders(bookmarkFolderGuids, window) {
    const share = await this.buildShareFromBookmarkFolders(bookmarkFolderGuids);
    await this.openShareUrlInNewTab(share, window);
  }

  /**
   * Shares the multi-selected tabs
   *
   * @param {MozTabbrowserTab[]} tabs
   */
  async handleShareTabs(tabs) {
    try {
      const shareObject = {
        type: "tabs",
        title: `${tabs.length} tabs`,
        children: tabs.map(t => ({
          uri: t.linkedBrowser.currentURI.spec,
          title: t.label.slice(0, 100),
        })),
      };

      const share = this.buildShare(shareObject);
      await this.openShareUrlInNewTab(share, tabs[0].ownerGlobal);
    } catch (e) {
      console.error("ContentSharingUtils: failed to share tabs", e);
    }
  }

  /**
   * Handles sharing a tab group by building a share object and sending it to the
   * content sharing server to get a shareable link, which is then opened in a
   * new tab.
   *
   * @param {MozTabbrowserTabGroup} tabGroup The tab group element to share
   */
  async handleShareTabGroup(tabGroup) {
    let title = tabGroup.label;
    if (!title) {
      title = await tabGroup.ownerDocument.l10n.formatValue(
        "tab-group-name-default"
      );
    }
    const shareObject = {
      title,
      type: "tab_group",
      children: tabGroup.tabs.map(t => {
        return { uri: t.linkedBrowser.currentURI.displaySpec, title: t.label };
      }),
    };

    const share = this.buildShare(shareObject);
    await this.openShareUrlInNewTab(share, tabGroup.ownerGlobal);
  }

  /**
   * Builds a share object from bookmark folder guids. It first builds out the
   * bookmark tree and then builds a share object from that tree, returning an
   * object to be validated against contentsharing.schema.json and sent to the
   * content sharing server. bookmarkFolderGuids must be 1 or more folder guids.
   * If more than 1, the first guid will be treated as the parent folder and
   * the rest will be nested inside it.
   *
   * @param {Array<string>} bookmarkFolderGuids An array of bookmark folder guids
   * @returns {Promise<object>} The built share object that will be validated against
   * the contentsharing.schema.json
   */
  async buildShareFromBookmarkFolders(bookmarkFolderGuids) {
    if (!bookmarkFolderGuids.length) {
      return null;
    }

    let bookmark;
    if (bookmarkFolderGuids.length === 1) {
      bookmark = await lazy.PlacesUtils.promiseBookmarksTree(
        bookmarkFolderGuids[0]
      );
    } else {
      // More than one folder selected: first folder is the parent, rest are children.
      bookmark = await lazy.PlacesUtils.promiseBookmarksTree(
        bookmarkFolderGuids[0]
      );
      bookmark.children = bookmark.children ?? [];

      for (let guid of bookmarkFolderGuids.slice(1)) {
        bookmark.children.push(
          await lazy.PlacesUtils.promiseBookmarksTree(guid)
        );
      }
    }

    bookmark.type = "bookmarks";

    return this.buildShare(bookmark);
  }

  /**
   * Builds a share object from a given bookmark tree/tab group/selected tabs.
   * The share object is a simplified version of the bookmark tree that only
   * includes the necessary information for sharing (e.g. title and url).
   * For bookmarks, the share object will have a type of "bookmarks" and will
   * include the title of the bookmark folder and an array of links, where each
   * link can either be a bookmark (with a url and optional title) or a nested
   * folder (with its own title and array of links). Nested folders will
   * recursively call this function to build their share objects.
   * For tab groups, the share object will have the type "tab_group" and will
   * take the title of the tab group.
   * For selected tabs, the share object will have the type "tabs" and the
   * title will be the number of tabs selected.
   * Both tab groups and selected tabs will include an array of links, where
   * each link will have a url and title.
   *
   * @param {object} shareObject The bookmark tree to share.
   * @returns {object} The built share object that will be validated against
   * the contentsharing.schema.json
   */

  buildShare(shareObject) {
    const share = {
      type: shareObject.type ?? "bookmarks",
      title: shareObject.title,
    };
    let links = [];
    for (let linkOrNestShare of shareObject.children ?? []) {
      if (linkOrNestShare.uri) {
        const link = {
          url: linkOrNestShare.uri,
          title: linkOrNestShare.title ?? "",
        };
        links.push(link);
      } else if (linkOrNestShare.children) {
        linkOrNestShare.type = "bookmarks";
        links.push(this.buildShare(linkOrNestShare));
      }
    }

    share.links = links;

    return share;
  }

  async openShareUrlInNewTab(share, window) {
    const shareUrl = await this.createShareableLink(share);
    window.openWebLinkIn(shareUrl, "tab");
  }

  async createShareableLink(share) {
    await this.validateSchema(share);

    if (!this.serverURL) {
      throw new Error("Content Sharing Server URL is not set");
    }

    let response = await fetch(this.serverURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(share),
    });

    let { url } = await response.json();

    return url;
  }

  countItems(share) {
    let count = 0;
    for (let item of share.links) {
      if (item.links) {
        count += this.countItems(item);
      }
      // Alway count the current item
      count += 1;
    }

    return count;
  }

  async validateSchema(share) {
    const validator = await this.getValidator();
    const result = validator.validate(share);

    if (!result.valid) {
      throw new Error(
        `ContentSharing Schema Error: ${result.errors.map(e => e.error).join(", ")}`
      );
    }

    if (this.countItems(share) > 100) {
      throw new Error(
        "ContentSharing Schema Error: Share object contains over 100 links"
      );
    }

    return true;
  }
}

const ContentSharingUtils = new ContentSharingUtilsClass();
export { ContentSharingUtils };
