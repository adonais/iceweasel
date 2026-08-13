/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const { a } = dom;

loader.lazyRequireGetter(
  this,
  "openDocLink",
  "resource://devtools/client/shared/link.js",
  true
);

function MDNLink({ url, title, children }) {
  return a(
    {
      className:
        "learn-more-link" +
        // we don't want a button if the component has children (usually text)
        (children ? "" : " devtools-button") +
        (url.startsWith("https://developer.mozilla.org") ? " mdn-link" : ""),
      href: url,
      title,
      onClick: e => onLearnMoreClick(e, url),
    },
    children
  );
}

MDNLink.displayName = "MDNLink";

MDNLink.propTypes = {
  url: PropTypes.string.isRequired,
};

function onLearnMoreClick(e, url) {
  e.stopPropagation();
  e.preventDefault();
  openDocLink(url);
}

module.exports = MDNLink;
