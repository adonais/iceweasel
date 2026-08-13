/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Component } from "resource://devtools/client/shared/vendor/react.mjs";
import * as dom from "resource://devtools/client/shared/vendor/react-dom-factories.mjs";
import PropTypes from "resource://devtools/client/shared/vendor/react-prop-types.mjs";

const { div, span } = dom;

const JSON_TYPES = ["object", "array", "string", "number", "boolean", "null"];

const defaultProps = {
  items: [],
};

/**
 * This template represents Bread-crumbs within 'JSON' panel.
 */
class JsonBreadcrumb extends Component {
  static get propTypes() {
    return {
      items: PropTypes.arrayOf(
        PropTypes.shape({
          type: PropTypes.oneOf(JSON_TYPES).isRequired,
          text: PropTypes.string.isRequired,
        })
      ),
    };
  }

  static get defaultProps() {
    return defaultProps;
  }

  renderBreadCrumb() {
    const { items } = this.props;

    return items.map((item, index) => {
      return [
        div(
          { key: index, className: "breadcrumb-item" },
          span({ className: `breadcrumb-icon breadcrumb-icon-${item.type}` }),
          span({ className: "breadcrumb-value" }, item.text)
        ),
        index !== items.length - 1 &&
          div({ className: "breadcrumb-separator" }),
      ];
    });
  }

  render() {
    if (!Array.isArray(this.props.items) || this.props.items.length === 0) {
      return null;
    }

    return div(
      { className: "json-breadcrumb toolbar" },
      this.renderBreadCrumb()
    );
  }
}

// Exports from this module
export default { JsonBreadcrumb };
