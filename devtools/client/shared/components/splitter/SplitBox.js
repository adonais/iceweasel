/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  Component,
  createFactory,
  createRef,
} = require("resource://devtools/client/shared/vendor/react.mjs");
const PropTypes = require("resource://devtools/client/shared/vendor/react-prop-types.mjs");
const dom = require("resource://devtools/client/shared/vendor/react-dom-factories.js");

const Draggable = createFactory(
  require("resource://devtools/client/shared/components/splitter/Draggable.js")
);

const { LocalizationHelper } = require("resource://devtools/shared/l10n.js");
const l10n = new LocalizationHelper(
  "devtools/client/locales/components.properties"
);

// How many pixels the splitter moves for one arrow key press. Keep in sync
// with kKeyboardDelta in nsSplitterFrame.cpp, which does this for the XUL
// `splitter` element.
const KEYBOARD_RESIZE_STEP = 5;

/**
 * This component represents a Splitter. The splitter supports vertical
 * as well as horizontal mode.
 */
class SplitBox extends Component {
  static get propTypes() {
    return {
      // Custom class name. You can use more names separated by a space.
      className: PropTypes.string,
      // Initial size of controlled panel.
      initialSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      // Initial width of controlled panel.
      initialWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      // Initial height of controlled panel.
      initialHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      // Left/top panel
      startPanel: PropTypes.any,
      // Left/top panel collapse state.
      startPanelCollapsed: PropTypes.bool,
      // Min panel size.
      minSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      // Max panel size.
      maxSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      // Right/bottom panel
      endPanel: PropTypes.any,
      // Right/bottom panel collapse state.
      endPanelCollapsed: PropTypes.bool,
      // True if the right/bottom panel should be controlled.
      endPanelControl: PropTypes.bool,
      // Size of the splitter handle bar.
      splitterSize: PropTypes.number,
      // True if the splitter bar is vertical (default is vertical).
      vert: PropTypes.bool,
      // Style object.
      style: PropTypes.object,
      // Call when controlled panel was resized.
      onControlledPanelResized: PropTypes.func,
      // Optional callback when splitbox resize stops
      onResizeEnd: PropTypes.func,
      // Retrieve DOM reference to the start panel element
      onSelectContainerElement: PropTypes.any,
    };
  }

  static get defaultProps() {
    return {
      splitterSize: 5,
      vert: true,
      endPanelControl: false,
    };
  }

  static getDerivedStateFromProps(props, state) {
    if (
      props.endPanelControl === state.prevEndPanelControl &&
      props.splitterSize === state.prevSplitterSize &&
      props.vert === state.prevVert
    ) {
      return null;
    }

    const newState = {};
    if (props.endPanelControl !== state.prevEndPanelControl) {
      newState.endPanelControl = props.endPanelControl;
      newState.prevEndPanelControl = props.endPanelControl;
    }
    if (props.splitterSize !== state.prevSplitterSize) {
      newState.splitterSize = props.splitterSize;
      newState.prevSplitterSize = props.splitterSize;
    }
    if (props.vert !== state.prevVert) {
      newState.vert = props.vert;
      newState.prevVert = props.vert;
    }

    return newState;
  }

  constructor(props) {
    super(props);

    /**
     * The state stores whether or not the end panel should be controlled, the current
     * orientation (vertical or horizontal), the splitter size, and the current size
     * (width/height). All these values can change during the component's life time.
     */
    this.state = {
      // True if the right/bottom panel should be controlled.
      endPanelControl: props.endPanelControl,
      // True if the splitter bar is vertical (default is vertical).
      vert: props.vert,
      // Size of the splitter handle bar.
      splitterSize: props.splitterSize,
      // The state for above 3 properties are derived from props, but also managed by the component itself.
      // SplitBox manages it's own state but sometimes the parent will pass in new props which will
      // override the current state of the component. So we need track the prev value of these props so that
      // compare them to the props change and derive new state whenever these 3 props change.
      prevEndPanelControl: props.endPanelControl,
      prevVert: props.vert,
      prevSplitterSize: props.splitterSize,
      // Width of controlled panel.
      width: props.initialWidth || props.initialSize,
      // Height of controlled panel.
      height: props.initialHeight || props.initialSize,
    };

    this.onStartMove = this.onStartMove.bind(this);
    this.onStopMove = this.onStopMove.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);

    // The splitter element, on which the ARIA properties are set directly.
    this.splitterEl = createRef();
    // The size an in-progress keyboard resize will persist on key up.
    this.sizeToPersist = null;
  }

  componentDidMount() {
    // The reported range depends on the size of the whole split box, which
    // changes without this component re-rendering: the window is resized, the
    // toolbox is resized, …
    const { ResizeObserver } = this.splitBox.ownerDocument.defaultView;
    this.resizeObserver = new ResizeObserver(() => this.updateAriaValues());
    this.resizeObserver.observe(this.splitBox);

    this.updateAriaControls();
    this.updateAriaValues();
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextState.width != this.state.width ||
      nextState.endPanelControl != this.props.endPanelControl ||
      nextState.height != this.state.height ||
      nextState.vert != this.state.vert ||
      nextState.splitterSize != this.state.splitterSize ||
      nextProps.startPanel != this.props.startPanel ||
      nextProps.endPanel != this.props.endPanel ||
      nextProps.minSize != this.props.minSize ||
      nextProps.maxSize != this.props.maxSize
    );
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      this.props.onControlledPanelResized &&
      (prevState.width !== this.state.width ||
        prevState.height !== this.state.height)
    ) {
      this.props.onControlledPanelResized(this.state.width, this.state.height);
    }
    this.updateAriaControls();
    this.updateAriaValues();
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
  }

  /**
   * Whether the splitter can be moved
   *
   * @return {boolean}
   */
  isResizable() {
    const { startPanel, startPanelCollapsed, endPanel, endPanelCollapsed } =
      this.props;
    return !!(
      startPanel &&
      !startPanelCollapsed &&
      endPanel &&
      !endPanelCollapsed
    );
  }

  /**
   * The container of the panel whose size `state.width`/`state.height` holds,
   * i.e. the one `render` sizes. Which panel that is does not depend on the
   * text direction.
   *
   * @return {Element|null}
   *         The controlled panel's container, or a falsy value when that panel
   *         is collapsed or absent.
   */
  getControlledPanelContainer() {
    return this.state.endPanelControl
      ? this.endPanelContainer
      : this.startPanelContainer;
  }

  /**
   * Resolve a `minSize`/`maxSize` prop to pixels.
   *
   * @param {number|string} size
   *        The prop value: a number of pixels, a `px` string or a percentage.
   * @param {number} splitBoxWidthOrHeight
   *        The split box's size along the split axis, which a percentage is
   *        relative to.
   * @return {number|null}
   *         The size in pixels, or null when there is no such limit.
   */
  resolveSizeInPx(size, splitBoxWidthOrHeight) {
    if (size == null) {
      return null;
    }
    const asString = size + "";
    if (asString.endsWith("%")) {
      return (parseFloat(asString) / 100) * splitBoxWidthOrHeight;
    }
    const asNumber = parseFloat(asString);
    return Number.isNaN(asNumber) ? null : asNumber;
  }

  /**
   * Point the splitter's `aria-controls` at the panel it resizes, as an
   * element reference since the panels have no id.
   */
  updateAriaControls() {
    const splitter = this.splitterEl.current;
    if (!splitter) {
      return;
    }
    const controlledPanel = this.getControlledPanelContainer();
    splitter.ariaControlsElements =
      this.isResizable() && controlledPanel ? [controlledPanel] : null;
  }

  /**
   * Set `aria-valuemin`, `aria-valuemax` and `aria-valuenow` on the splitter.
   */
  updateAriaValues() {
    const splitter = this.splitterEl.current;
    if (!splitter) {
      return;
    }

    const controlledPanel = this.getControlledPanelContainer();
    // A splitter which resizes nothing has no position to report, and a value
    // left from an earlier render is now wrong.
    if (!this.isResizable() || !controlledPanel) {
      splitter.removeAttribute("aria-valuemin");
      splitter.removeAttribute("aria-valuemax");
      splitter.removeAttribute("aria-valuenow");
      return;
    }

    const { vert } = this.state;
    const boxBounds = this.splitBox.getBoundingClientRect();
    const total = vert ? boxBounds.width : boxBounds.height;
    const panelBounds = controlledPanel.getBoundingClientRect();

    const min = this.resolveSizeInPx(this.props.minSize, total) ?? 0;
    const max = this.resolveSizeInPx(this.props.maxSize, total) ?? total;
    // Directly set the attribute on the element here instead of in React land
    // so we avoid React re-rendering when resizing.
    splitter.setAttribute("aria-valuemin", Math.round(min));
    splitter.setAttribute("aria-valuemax", Math.round(max));
    splitter.setAttribute(
      "aria-valuenow",
      Math.round(vert ? panelBounds.width : panelBounds.height)
    );
  }

  // Dragging Events

  /**
   * Set 'resizing' cursor on entire document during splitter dragging.
   * This avoids cursor-flickering that happens when the mouse leaves
   * the splitter bar area (happens frequently).
   */
  onStartMove() {
    const doc = this.splitBox.ownerDocument;
    const defaultCursor = doc.documentElement.style.cursor;
    doc.documentElement.style.cursor = this.state.vert
      ? "ew-resize"
      : "ns-resize";

    this.splitBox.classList.add("dragging");

    this.setState({
      defaultCursor,
    });
  }

  onStopMove() {
    const doc = this.splitBox.ownerDocument;
    doc.documentElement.style.cursor = this.state.defaultCursor;

    this.splitBox.classList.remove("dragging");

    if (this.props.onResizeEnd) {
      this.props.onResizeEnd(
        this.state.vert ? this.state.width : this.state.height
      );
    }
  }

  /**
   * Move the splitter with the keyboard, with the same keys as the XUL
   * `splitter` element: only the two arrows on the splitter's own axis, so that
   * what the user sees move matches the direction they pressed.
   */
  onKeyDown(event) {
    const { vert } = this.state;
    const towardsEnd = vert ? "ArrowRight" : "ArrowDown";
    const towardsStart = vert ? "ArrowLeft" : "ArrowUp";

    let step;
    if (event.key == towardsEnd) {
      step = KEYBOARD_RESIZE_STEP;
    } else if (event.key == towardsStart) {
      step = -KEYBOARD_RESIZE_STEP;
    } else {
      return;
    }

    const controlledPanel = this.getControlledPanelContainer();
    if (!controlledPanel) {
      return;
    }

    // Switch the control flag in case of RTL, as `onMove` does. This decides
    // the sign of the movement only; which panel is sized does not depend on
    // the text direction.
    let { endPanelControl } = this.state;
    if (vert && this.splitBox.ownerDocument.dir === "rtl") {
      endPanelControl = !endPanelControl;
    }

    event.preventDefault();

    const boxBounds = this.splitBox.getBoundingClientRect();
    const total = vert ? boxBounds.width : boxBounds.height;
    const panelBounds = controlledPanel.getBoundingClientRect();
    const current = vert ? panelBounds.width : panelBounds.height;

    const max = this.resolveSizeInPx(this.props.maxSize, total) ?? total;
    const size = Math.min(
      this.getConstrainedSizeInPx(
        current + (endPanelControl ? -step : step),
        total
      ),
      max,
      total
    );
    this.setState(vert ? { width: size } : { height: size });

    // Persist once the user stops, rather than on every auto-repeat, since
    // consumers write a preference from this.
    this.sizeToPersist = size;
  }

  onKeyUp() {
    if (this.sizeToPersist !== null && this.props.onResizeEnd) {
      this.props.onResizeEnd(this.sizeToPersist);
    }
    this.sizeToPersist = null;
  }

  /**
   * Adjust size of the controlled panel. Depending on the current
   * orientation we either remember the width or height of
   * the splitter box.
   */
  onMove(x, y) {
    const nodeBounds = this.splitBox.getBoundingClientRect();

    let size;
    let { endPanelControl, vert } = this.state;

    if (vert) {
      // Use the document owning the SplitBox to detect rtl. The global document might be
      // the one bound to the toolbox shared BrowserRequire, which is irrelevant here.
      const doc = this.splitBox.ownerDocument;

      // Switch the control flag in case of RTL. Note that RTL
      // has impact on vertical splitter only.
      if (doc.dir === "rtl") {
        endPanelControl = !endPanelControl;
      }

      size = endPanelControl
        ? nodeBounds.left + nodeBounds.width - x
        : x - nodeBounds.left;

      this.setState({
        width: this.getConstrainedSizeInPx(size, nodeBounds.width),
      });
    } else {
      size = endPanelControl
        ? nodeBounds.top + nodeBounds.height - y
        : y - nodeBounds.top;

      this.setState({
        height: this.getConstrainedSizeInPx(size, nodeBounds.height),
      });
    }
  }

  /**
   * Calculates the constrained size taking into account the minimum width or
   * height passed via this.props.minSize.
   *
   * @param {number} requestedSize
   *        The requested size
   * @param {number} splitBoxWidthOrHeight
   *        The width or height of the splitBox
   *
   * @return {number}
   *         The constrained size
   */
  getConstrainedSizeInPx(requestedSize, splitBoxWidthOrHeight) {
    const minSize =
      this.resolveSizeInPx(this.props.minSize, splitBoxWidthOrHeight) ?? 0;
    return Math.max(requestedSize, minSize);
  }

  // Rendering

  // eslint-disable-next-line complexity
  render() {
    const { endPanelControl, splitterSize, vert } = this.state;
    const {
      startPanel,
      startPanelCollapsed,
      endPanel,
      endPanelCollapsed,
      minSize,
      maxSize,
      onSelectContainerElement,
    } = this.props;

    const style = Object.assign(
      {
        // Set the size of the controlled panel (height or width depending on the
        // current state). This can be used to help with styling of dependent
        // panels.
        "--split-box-controlled-panel-size": `${
          vert ? this.state.width : this.state.height
        }`,
      },
      this.props.style
    );

    // Calculate class names list.
    let classNames = ["split-box"];
    classNames.push(vert ? "vert" : "horz");
    if (this.props.className) {
      classNames = classNames.concat(this.props.className.split(" "));
    }

    let leftPanelStyle;
    let rightPanelStyle;

    // Set proper size for panels depending on the current state.
    if (vert) {
      leftPanelStyle = {
        maxWidth: endPanelControl ? null : maxSize,
        minWidth: endPanelControl ? null : minSize,
        width: endPanelControl ? null : this.state.width,
      };
      rightPanelStyle = {
        maxWidth: endPanelControl ? maxSize : null,
        minWidth: endPanelControl ? minSize : null,
        width: endPanelControl ? this.state.width : null,
      };
    } else {
      leftPanelStyle = {
        maxHeight: endPanelControl ? null : maxSize,
        minHeight: endPanelControl ? null : minSize,
        height: endPanelControl ? null : this.state.height,
      };
      rightPanelStyle = {
        maxHeight: endPanelControl ? maxSize : null,
        minHeight: endPanelControl ? minSize : null,
        height: endPanelControl ? this.state.height : null,
      };
    }

    // Calculate splitter size
    const splitterStyle = {
      flex: "0 0 " + splitterSize + "px",
    };

    const resizable = this.isResizable();

    return dom.div(
      {
        className: classNames.join(" "),
        ref: div => {
          this.splitBox = div;
        },
        style,
      },
      startPanel && !startPanelCollapsed
        ? dom.div(
            {
              className: endPanelControl ? "uncontrolled" : "controlled",
              style: leftPanelStyle,
              role: "presentation",
              ref: div => {
                this.startPanelContainer = div;
                if (onSelectContainerElement) {
                  onSelectContainerElement(div);
                }
              },
            },
            startPanel
          )
        : null,
      splitterSize > 0
        ? Draggable({
            className: "splitter",
            elementRef: this.splitterEl,
            style: splitterStyle,
            onStart: this.onStartMove,
            onStop: this.onStopMove,
            onMove: this.onMove,
            role: "separator",
            // `aria-orientation` conveys how the panels the splitter separates
            // are laid out, so it is the opposite of the splitter's own axis:
            // a vertical splitter has a panel on either side of it.
            ariaOrientation: vert ? "horizontal" : "vertical",
            ...(resizable
              ? {
                  onKeyDown: this.onKeyDown,
                  onKeyUp: this.onKeyUp,
                  tabIndex: 0,
                  ariaLabel: l10n.getStr("splitter.label"),
                }
              : null),
          })
        : null,
      endPanel && !endPanelCollapsed
        ? dom.div(
            {
              className: endPanelControl ? "controlled" : "uncontrolled",
              style: rightPanelStyle,
              role: "presentation",
              ref: div => {
                this.endPanelContainer = div;
              },
            },
            endPanel
          )
        : null
    );
  }
}

module.exports = SplitBox;
