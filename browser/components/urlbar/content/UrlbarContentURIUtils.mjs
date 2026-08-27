/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This module exports the XPCOM-backed text transforms needed to render a URL
 * for the user: the IDN-safe Unicode form of a URL, and the unescaping of
 * percent-encoding. Both apply spoofing protections that can't be reproduced
 * with the URL parser or `decodeURIComponent`, so there is no content-realm
 * equivalent. Content modules (.mjs) should import them from here.
 */

function getURIUtils() {
  if (typeof ChromeUtils != "undefined") {
    return {
      getDisplaySpec(url) {
        try {
          return Services.io.newURI(url).displaySpec;
        } catch (ex) {
          return null;
        }
      },
      unEscapeURIForUI(uri) {
        return Services.textToSubURI.unEscapeURIForUI(uri);
      },
    };
  }

  // In child processes the Urlbar actor exposes these on the window, as part of
  // the single port it publishes there. To expose more, change the Urlbar actor.
  return {
    getDisplaySpec: url => window.UrlbarActorPort.getDisplaySpec(url),
    unEscapeURIForUI: uri => window.UrlbarActorPort.unEscapeURIForUI(uri),
  };
}

export default getURIUtils();
