/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  createFactory,
  PureComponent,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");
const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");

const FluentReact = require("resource://devtools/client/shared/vendor/fluent-react.js");

const DebugTargetList = createFactory(
  require("resource://devtools/client/aboutdebugging/src/components/debugtarget/DebugTargetList.js")
);

const Actions = require("resource://devtools/client/aboutdebugging/src/actions/index.js");
const Types = require("resource://devtools/client/aboutdebugging/src/types/index.js");

/**
 * This component provides list for debug target and name area.
 */
class DebugTargetPane extends PureComponent {
  static get propTypes() {
    return {
      actionComponent: PropTypes.any.isRequired,
      additionalActionsComponent: PropTypes.any,
      children: PropTypes.node,
      collapsibilityKey: PropTypes.string.isRequired,
      detailComponent: PropTypes.any.isRequired,
      dispatch: PropTypes.func.isRequired,
      // Provided by wrapping the component with FluentReact.withLocalization.
      getString: PropTypes.func.isRequired,
      icon: PropTypes.string.isRequired,
      isCollapsed: PropTypes.bool.isRequired,
      name: PropTypes.string.isRequired,
      targets: PropTypes.arrayOf(Types.debugTarget).isRequired,
    };
  }

  constructor(props) {
    super(props);
  }

  updateCollapsibility(event) {
    const { collapsibilityKey, dispatch } = this.props;
    dispatch(
      Actions.updateDebugTargetCollapsibility(
        collapsibilityKey,
        !event.target.open
      )
    );
  }

  render() {
    const {
      actionComponent,
      additionalActionsComponent,
      children,
      collapsibilityKey,
      detailComponent,
      dispatch,
      getString,
      icon,
      isCollapsed,
      name,
      targets,
    } = this.props;

    return dom.section(
      {
        className: "qa-debug-target-pane",
      },
      dom.details(
        {
          open: !isCollapsed,
          onToggle: e => this.updateCollapsibility(e),
        },
        dom.summary(
          {
            className:
              "main-subheading debug-target-pane__heading qa-debug-target-pane-title",
            title: getString("about-debugging-collapse-expand-debug-targets"),
          },
          dom.img({
            className: "main-subheading__icon",
            src: icon,
            alt: "",
          }),
          `${name} (${targets.length})`,
          dom.img({
            className: "main-subheading__icon debug-target-pane__icon",
            src: "chrome://devtools/skin/images/arrow-e.svg",
            alt: "",
          })
        ),
        dom.div(
          {
            className:
              "debug-target-pane__collapsable qa-debug-target-pane__collapsable",
            id: `debug-target-pane-${collapsibilityKey}`,
          },
          children,
          DebugTargetList({
            actionComponent,
            additionalActionsComponent,
            detailComponent,
            dispatch,
            isCollapsed,
            targets,
          })
        )
      )
    );
  }
}

module.exports = FluentReact.withLocalization(DebugTargetPane);
