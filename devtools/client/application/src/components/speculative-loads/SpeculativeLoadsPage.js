/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");
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
  table,
  thead,
  tbody,
  tr,
  th,
  td,
} = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const {
  connect,
} = require("resource://devtools/client/shared/vendor/react-redux.js");

const FluentReact = require("resource://devtools/client/shared/vendor/fluent-react.js");
const Localized = createFactory(FluentReact.Localized);

class SpeculativeLoadsPage extends PureComponent {
  static get propTypes() {
    return {
      activatedFromNavigationalPrefetch: PropTypes.bool,
      speculations: PropTypes.arrayOf(
        PropTypes.shape({
          resourceId: PropTypes.number.isRequired,
          url: PropTypes.string.isRequired,
          action: PropTypes.string.isRequired,
          status: PropTypes.string.isRequired,
        })
      ).isRequired,
    };
  }

  renderSpeculations() {
    const { speculations } = this.props;
    if (!speculations.length) {
      return Localized(
        { id: "speculative-loads-empty-list" },
        p({ className: "js-speculations-empty" })
      );
    }

    return table(
      {
        className: "speculations-table js-speculations-table",
        "aria-labelledby": "speculations-heading",
      },
      thead(
        {},
        tr(
          {},
          ...["url", "action", "status"].map(column =>
            Localized(
              { id: `speculative-loads-column-${column}`, key: column },
              th({ scope: "col" })
            )
          )
        )
      ),
      tbody(
        {},
        ...speculations.map(({ resourceId, url, action, status }) =>
          tr(
            { key: resourceId, "data-status": status },
            td(
              { className: "speculation-url technical-text", title: url },
              url
            ),
            Localized(
              { id: `speculative-loads-action-${action}` },
              td({ className: "speculation-action" })
            ),
            Localized(
              { id: `speculative-loads-status-${status}` },
              td({ className: "speculation-status" })
            )
          )
        )
      )
    );
  }

  render() {
    const { activatedFromNavigationalPrefetch } = this.props;
    let status = "unknown";
    if (typeof activatedFromNavigationalPrefetch === "boolean") {
      status = activatedFromNavigationalPrefetch
        ? "prefetched"
        : "not-prefetched";
    }
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
          {
            className: "speculative-loads-status",
            "data-prefetch-status": status,
            role: "status",
          },
          span({
            className: "status-icon",
            "aria-hidden": true,
          }),
          Localized(
            { id: `speculative-loads-prefetch-status-${status}` },
            span({ className: "status-text" })
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
            id: "speculations-heading",
          })
        ),
        this.renderSpeculations()
      )
    );
  }
}

function mapStateToProps(state) {
  return {
    activatedFromNavigationalPrefetch:
      state.page.activatedFromNavigationalPrefetch,
    speculations: Object.values(state.speculativeLoads.requests),
  };
}

// Exports
module.exports = connect(mapStateToProps)(SpeculativeLoadsPage);
