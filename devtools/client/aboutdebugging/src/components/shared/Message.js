/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  createElement,
  PureComponent,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");

const {
  MESSAGE_LEVEL,
} = require("resource://devtools/client/aboutdebugging/src/constants.js");

const ICONS = {
  [MESSAGE_LEVEL.ERROR]:
    "chrome://devtools/skin/images/aboutdebugging-error.svg",
  [MESSAGE_LEVEL.INFO]:
    "chrome://devtools/skin/images/aboutdebugging-information.svg",
  [MESSAGE_LEVEL.WARNING]: "chrome://devtools/skin/images/alert.svg",
};

const ICON_L10N_ID = {
  [MESSAGE_LEVEL.ERROR]: "about-debugging-message-error-icon",
  [MESSAGE_LEVEL.INFO]: "about-debugging-message-info-icon",
  [MESSAGE_LEVEL.WARNING]: "about-debugging-message-warning-icon",
};

const CLOSE_ICON_SRC = "chrome://devtools/skin/images/close.svg";

/**
 * This component is designed to display a photon-style message bar. The component is
 * responsible for displaying the message container with the appropriate icon. The content
 * of the message should be passed as the children of this component.
 */
class Message extends PureComponent {
  static get propTypes() {
    return {
      children: PropTypes.node.isRequired,
      className: PropTypes.string,
      isCloseable: PropTypes.bool,
      level: PropTypes.oneOf(Object.values(MESSAGE_LEVEL)).isRequired,
    };
  }

  constructor(props) {
    super(props);
    this.state = {
      isClosed: false,
    };
  }

  closeMessage() {
    this.setState({ isClosed: true });
  }

  renderButton(level) {
    return createElement("moz-button", {
      class: `message__button message__button--${level} qa-message-button-close-button`,
      type: "icon ghost",
      iconsrc: CLOSE_ICON_SRC,
      "data-l10n-id": "about-debugging-message-close-icon2",
      onClick: () => this.closeMessage(),
    });
  }

  render() {
    const { children, className, level, isCloseable } = this.props;
    const { isClosed } = this.state;

    if (isClosed) {
      return null;
    }

    return dom.aside(
      {
        className:
          `message message--level-${level}  qa-message` +
          (className ? ` ${className}` : ""),
      },
      dom.img({
        className: "message__icon",
        "data-l10n-id": ICON_L10N_ID[level],
        src: ICONS[level],
      }),
      dom.div(
        {
          className: "message__body",
        },
        children
      ),
      // if the message is closeable, render a closing button
      isCloseable ? this.renderButton(level) : null
    );
  }
}

module.exports = Message;
