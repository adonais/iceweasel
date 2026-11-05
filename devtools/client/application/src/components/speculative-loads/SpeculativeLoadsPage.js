/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  createFactory,
  PureComponent,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const {
  section,
  article,
  h1,
  p,
  span,
} = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const {
  connect,
} = require("resource://devtools/client/shared/vendor/react-redux.js");

const FluentReact = require("resource://devtools/client/shared/vendor/fluent-react.js");
const Localized = createFactory(FluentReact.Localized);

class SpeculativeLoadsPage extends PureComponent {
  static get propTypes() {
    return {};
  }

  render() {
    return section(
      {
        className: "app-page js-speculative-loads-page",
      },
      article(
        {
          className: "speculative-loads-pane",
          key: "specuative-loads-page-status",
        },
        Localized(
          { id: "speculative-loads-page-status-header" },
          h1({
            className: "app-page__title",
          })
        ),
        p(
          { className: "speculative-loads-status" },
          span({
            className: "status-icon",
          }),
          Localized(
            { id: "speculative-loads-no-speculative-prefetch-status" },
            span({ class: "status-text" })
          )
        )
      ),
      article(
        {
          className: "speculative-loads-pane",
          key: "specuative-loads-speculations",
        },
        Localized(
          { id: "speculative-loads-speculations-header" },
          h1({
            className: "app-page__title",
          })
        ),
        p(
          { className: "" },
          span(
            {},
            "// TODO: THIS SHOULD SHOW THE LIST OF INITIATED SPECUlATIONS"
          )
        )
      )
    );
  }
}

function mapStateToProps() {
  return {};
}

// Exports
module.exports = connect(mapStateToProps)(SpeculativeLoadsPage);
