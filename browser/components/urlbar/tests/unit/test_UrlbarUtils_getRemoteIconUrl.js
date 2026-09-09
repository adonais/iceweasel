/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests which icon URLs UrlbarUtils.getRemoteIconUrl hands on as they are and
// which it wraps in `moz-remote-image:` so the image decodes outside the
// parent process (bug 2012436).

"use strict";

const SIZE = 16;

// The icon of a rich suggestion, as the search provider sends it.
const DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

// A controller whose view renders in a content process, which decodes what it
// displays itself.
const CONTENT_CONTROLLER = { rendersInContentProcess: true };

/**
 * Asserts that an icon URL came back wrapped in `moz-remote-image:`.
 *
 * @param {string} iconUrl
 *   The URL passed to `getRemoteIconUrl`.
 * @param {?string} result
 *   What `getRemoteIconUrl` returned.
 */
function assertWrapped(iconUrl, result) {
  let url = URL.parse(result);
  Assert.equal(url?.protocol, "moz-remote-image:", `${iconUrl} is wrapped`);
  Assert.equal(
    url.searchParams.get("url"),
    iconUrl,
    "The wrapper carries the original URL"
  );
}

add_task(function trustedSchemesPassThrough() {
  // These are the browser's own images, so there is nothing to re-encode.
  for (let iconUrl of [
    "chrome://global/skin/icons/search-glass.svg",
    "about:logo",
    "resource://content-accessible/moz.png",
  ]) {
    Assert.equal(
      UrlbarUtils.getRemoteIconUrl(iconUrl, SIZE),
      iconUrl,
      `${iconUrl} is used as it is`
    );
  }
});

add_task(function untrustedSchemesAreWrapped() {
  for (let iconUrl of [
    DATA_URL,
    "https://example.com/favicon.ico",
    "http://example.com/favicon.ico",
  ]) {
    assertWrapped(iconUrl, UrlbarUtils.getRemoteIconUrl(iconUrl, SIZE));
  }
});

add_task(function unexpectedSchemesAreWrapped() {
  // A provider can send anything. None of these reach an <img> unwrapped, and
  // `moz-remote-image:` produces no image for them.
  for (let iconUrl of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/favicon.ico",
    "blob:https://example.com/6a1b2c3d",
    "moz-remote-image://?url=https%3A%2F%2Fexample.com%2Ffavicon.ico",
  ]) {
    assertWrapped(iconUrl, UrlbarUtils.getRemoteIconUrl(iconUrl, SIZE));
  }
});

add_task(function nonUrlsYieldNull() {
  for (let iconUrl of [
    "",
    "not a url",
    "example.com/favicon.ico",
    "//host/x",
  ]) {
    Assert.equal(
      UrlbarUtils.getRemoteIconUrl(iconUrl, SIZE),
      null,
      `${iconUrl} is not a URL`
    );
  }
});

add_task(function contentProcessViewTakesTheIconAsItIs() {
  for (let iconUrl of [
    DATA_URL,
    "https://example.com/favicon.ico",
    "chrome://global/skin/icons/search-glass.svg",
  ]) {
    Assert.equal(
      UrlbarUtils.getRemoteIconUrl(iconUrl, SIZE, CONTENT_CONTROLLER),
      iconUrl,
      `${iconUrl} is used as it is`
    );
  }

  // The scheme check the wrapper would apply doesn't apply here, but the page
  // still can't load these -- http because its CSP allows only https:, data:,
  // blob: and chrome: -- so the row falls back to a broken-image icon.
  for (let iconUrl of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "http://example.com/favicon.ico",
  ]) {
    Assert.equal(
      UrlbarUtils.getRemoteIconUrl(iconUrl, SIZE, CONTENT_CONTROLLER),
      iconUrl,
      `${iconUrl} is used as it is`
    );
  }

  Assert.equal(
    UrlbarUtils.getRemoteIconUrl("not a url", SIZE, CONTENT_CONTROLLER),
    null,
    "A string that isn't a URL is still rejected"
  );
});
