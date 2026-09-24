/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Per-realm accessors for things a content module can't reach for itself. Where
 * the Urlbar actor has published a port on the window, they go through it;
 * otherwise this realm reaches them directly. Keying on the port rather than on
 * the realm means the chrome message path takes the same route an unprivileged
 * input does. One module for all of them, so the branch isn't duplicated per
 * accessor.
 */

const lazy = typeof ChromeUtils != "undefined" ? {} : null;

if (lazy) {
  ChromeUtils.defineESModuleGetters(lazy, {
    UrlbarPrefs: "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs",
  });
}

/**
 * @import {UrlbarActorPort} from "moz-src:///browser/components/urlbar/actors/UrlbarChild.sys.mjs"
 * @import {URIFixupPrimitives} from "chrome://browser/content/urlbar/UrlbarShared.mjs"
 */

/**
 * The port the actor publishes on a realm that routes through it, or null where
 * this realm reaches its privileged side itself. The actor's own scope has no
 * window, so its handlers always take the direct branch and never re-enter.
 *
 * @returns {?UrlbarActorPort}
 */
function port() {
  return globalThis.window?.UrlbarActorPort ?? null;
}

let platform;

/**
 * The platform, as `AppConstants.platform` names it. Read on first use rather
 * than on import: a content realm has no port until the actor publishes one.
 *
 * @returns {string}
 *   The platform, e.g. "macosx", "win" or "linux".
 */
export function getPlatform() {
  if (platform) {
    return platform;
  }
  if (!port()) {
    platform = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs"
    ).AppConstants.platform;
  } else {
    // In child processes the Urlbar actor exposes this on the window, as part of
    // the single port it publishes there. To expose more, change the Urlbar
    // actor.
    platform = port().getPlatform();
  }
  return platform;
}

/**
 * Whether a window is private.
 *
 * @param {Window} win
 *   The window to check.
 * @returns {boolean}
 */
export function isWindowPrivate(win) {
  if (!port()) {
    return ChromeUtils.importESModule(
      "resource://gre/modules/PrivateBrowsingUtils.sys.mjs"
    ).PrivateBrowsingUtils.isWindowPrivate(win);
  }
  return port().isWindowPrivate;
}

/**
 * A URL's display spec: the IDN-safe Unicode form the URL parser can't produce.
 *
 * @param {string} url
 *   The URL to parse.
 * @returns {?string}
 *   The display spec, or null if the URL can't be parsed.
 */
export function getDisplaySpec(url) {
  if (!port()) {
    try {
      return Services.io.newURI(url).displaySpec;
    } catch (ex) {
      return null;
    }
  }
  return port().getDisplaySpec(url);
}

/**
 * Unescapes a URI's percent-encoding for display, applying the spoofing
 * protections `decodeURIComponent` doesn't.
 *
 * @param {string} uri
 *   The URI fragment to unescape.
 * @returns {string}
 */
export function unEscapeURIForUI(uri) {
  if (!port()) {
    return Services.textToSubURI.unEscapeURIForUI(uri);
  }
  return port().unEscapeURIForUI(uri);
}

/**
 * The SUMO URL for a support topic.
 *
 * @param {string} topic
 *   The support page slug to append to the SUMO base URL.
 * @returns {string}
 */
export function getSupportUrl(topic) {
  if (!port()) {
    return Services.urlFormatter.formatURLPref("app.support.baseURL") + topic;
  }
  return port().getSupportUrl(topic);
}

/**
 * URI fixup primitives for a string, so a caller never holds an
 * `nsIURIFixupInfo`.
 *
 * @param {string} searchString
 *   The string to fix up.
 * @param {boolean} isPrivate
 *   Whether the fixup runs for a private context.
 * @returns {?URIFixupPrimitives}
 *   The primitives, or null if fixup threw.
 */
export function getFixupPrimitives(searchString, isPrivate) {
  if (!port()) {
    return ChromeUtils.importESModule(
      "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs"
    ).UrlbarUtils.getFixupPrimitives(searchString, isPrivate);
  }
  return port().getFixupPrimitives(searchString, isPrivate);
}

/**
 * Whether a string reads right-to-left.
 *
 * @param {string} value
 *   The text to check.
 * @param {Window} win
 *   Any window.
 *   When calling from a content global, this window must have a UrlbarActorPort.
 * @returns {boolean}
 */
export function isTextDirectionRTL(value, win) {
  if (!port()) {
    return (
      win.windowUtils.getDirectionFromText(value) ==
      win.windowUtils.DIRECTION_RTL
    );
  }
  return port().isTextDirectionRTL(value, win);
}

/**
 * Where an event says a link should be opened.
 *
 * @param {KeyboardEvent | MouseEvent} event
 *   The event that triggered the opening.
 * @returns {"current" | "tabshifted" | "tab" | "save" | "window"}
 */
export function whereToOpenLink(event) {
  if (!port()) {
    return ChromeUtils.importESModule(
      "resource://gre/modules/BrowserUtils.sys.mjs"
    ).BrowserUtils.whereToOpenLink(event, false, false);
  }
  return port().whereToOpenLink(event);
}

/**
 * Whether a pick opened with the given `where` will load in the background.
 *
 * @param {string} where
 *   Where the pick will open, as returned by `whereToOpenLink`.
 * @param {object} params
 *   The params that will be passed to `openLinkIn`.
 * @returns {boolean}
 */
export function willLoadInBackground(where, params) {
  if (!port()) {
    return ChromeUtils.importESModule(
      "resource://gre/modules/BrowserUtils.sys.mjs"
    ).BrowserUtils.willLoadInBackground(where, params);
  }
  return port().willLoadInBackground(where, params);
}

/**
 * Whether the message path or direct path should be used.
 *
 * @returns {boolean}
 */
export function usesMessagePath() {
  return (
    !lazy ||
    Services.appinfo.processType != Services.appinfo.PROCESS_TYPE_DEFAULT ||
    lazy.UrlbarPrefs.get("ipc.chromeMessagePassing")
  );
}
