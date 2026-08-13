/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import React, { Component } from "devtools/client/shared/vendor/react";
import dom from "devtools/client/shared/vendor/react-dom-factories";
import PropTypes from "devtools/client/shared/vendor/react-prop-types";
import { connect } from "devtools/client/shared/vendor/react-redux";

import { containsPosition, positionAfter } from "../../utils/ast";
import { formatAtRuleContent } from "../../utils/quick-open";
import { createLocation } from "../../utils/location";

import actions from "../../actions/index";
import {
  getSelectedLocation,
  getSelectedSourceTextContent,
  getStyleSheetAtRules,
} from "../../selectors/index";

import OutlineFilter from "./OutlineFilter";
import PreviewFunction from "../shared/PreviewFunction";

import { isFulfilled } from "../../utils/async-value";

const classnames = require("resource://devtools/client/shared/classnames.js");
const {
  score: fuzzaldrinScore,
} = require("resource://devtools/client/shared/vendor/fuzzaldrin-plus.js");

// Set higher to make the fuzzaldrin filter more specific
const FUZZALDRIN_FILTER_THRESHOLD = 15000;

/**
 * Check whether the name argument matches the fuzzy filter argument
 */
const filterOutlineItem = (name, filter) => {
  if (!filter) {
    return true;
  }

  if (filter.length === 1) {
    // when filter is a single char just check if it starts with the char
    return filter.toLowerCase() === name.toLowerCase()[0];
  }
  return fuzzaldrinScore(name, filter) > FUZZALDRIN_FILTER_THRESHOLD;
};

// Checks if an element is visible inside its parent element
function isVisible(element, parent) {
  const parentRect = parent.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const parentTop = parentRect.top;
  const parentBottom = parentRect.bottom;
  const elTop = elementRect.top;
  const elBottom = elementRect.bottom;

  return parentTop < elTop && parentBottom > elBottom;
}

export class Outline extends Component {
  constructor(props) {
    super(props);
    this.focusedElRef = null;
    this.state = { filter: "", focusedItem: null, symbols: null };
  }

  static get propTypes() {
    return {
      atRules: PropTypes.array.isRequired,
      alphabetizeOutline: PropTypes.bool.isRequired,
      onAlphabetizeClick: PropTypes.func.isRequired,
      selectLocation: PropTypes.func.isRequired,
      selectedLocation: PropTypes.object,
      getFunctionSymbols: PropTypes.func.isRequired,
      getClassSymbols: PropTypes.func.isRequired,
      selectedSourceTextContent: PropTypes.object,
      canFetchSymbols: PropTypes.bool,
      launchResponsiveMode: PropTypes.func.isRequired,
      isLocalTab: PropTypes.func.isRequired,
    };
  }

  componentDidMount() {
    const { canFetchSymbols, selectedLocation } = this.props;
    if (!canFetchSymbols) {
      return;
    }

    if (!selectedLocation.source.isStyleSheet) {
      this.getClassAndFunctionSymbols();
    }
  }

  componentDidUpdate(prevProps) {
    const { selectedLocation, selectedSourceTextContent, canFetchSymbols } =
      this.props;
    if (selectedLocation && selectedLocation !== prevProps.selectedLocation) {
      this.setFocus(selectedLocation);
    }

    if (
      this.focusedElRef &&
      !isVisible(this.focusedElRef, this.refs.outlineList)
    ) {
      this.focusedElRef.scrollIntoView({ block: "center" });
    }

    // Lets make sure the source text has been loaded and it is different
    if (
      canFetchSymbols &&
      prevProps.selectedSourceTextContent !== selectedSourceTextContent &&
      !selectedLocation.source.isStyleSheet
    ) {
      this.getClassAndFunctionSymbols();
    }
  }

  async getClassAndFunctionSymbols() {
    const { selectedLocation, getFunctionSymbols, getClassSymbols } =
      this.props;

    const functions = await getFunctionSymbols(selectedLocation);
    const classes = await getClassSymbols(selectedLocation);

    this.setState({ symbols: { functions, classes } });
  }

  async setFocus(selectedLocation) {
    const { symbols } = this.state;

    let classes = [];
    let functions = [];

    if (symbols) {
      ({ classes, functions } = symbols);
    }

    // Find items that enclose the selected location
    const enclosedItems = [...classes, ...functions].filter(({ location }) =>
      containsPosition(location, selectedLocation)
    );

    if (!enclosedItems.length) {
      this.setState({ focusedItem: null });
      return;
    }

    // Find the closest item to the selected location to focus
    const closestItem = enclosedItems.reduce((item, closest) =>
      positionAfter(item.location, closest.location) ? item : closest
    );

    this.setState({ focusedItem: closestItem });
  }

  selectItem(selectedItem) {
    const { selectedLocation, selectLocation } = this.props;
    if (!selectedLocation || !selectedItem) {
      return;
    }
    const { source } = selectedLocation;
    selectLocation(
      createLocation({
        source,
        line: source.isStyleSheet
          ? selectedItem.line
          : selectedItem.location.start.line,
        // Stylesheet at-rules location are 0 based, codemirror is 1 based
        column: source.isStyleSheet
          ? selectedItem.column - 1
          : selectedItem.location.start.column,
      })
    );

    this.setState({ focusedItem: selectedItem });
  }

  onContextMenu(event, func) {
    event.stopPropagation();
    event.preventDefault();

    const { symbols } = this.state;
    this.props.showOutlineContextMenu(event, func, symbols);
  }

  /**
   * Called when a media condition is clicked
   * If a responsive mode link is clicked, it will launch it.
   *
   * @param {object} e
   *        Event object
   */
  onMediaConditionClick(e) {
    const conditionText = e.target.textContent;
    const isWidthCond = conditionText.toLowerCase().indexOf("width") > -1;
    const mediaVal = parseInt(/\d+/.exec(conditionText), 10);

    const options = isWidthCond ? { width: mediaVal } : { height: mediaVal };
    this.props.launchResponsiveMode(options);
    e.preventDefault();
    e.stopPropagation();
  }

  updateFilter = filter => {
    this.setState({ filter });
  };

  renderPlaceholder() {
    const { selectedLocation } = this.props;
    let placeholderMessage;
    if (selectedLocation) {
      placeholderMessage = selectedLocation.source.isStyleSheet
        ? L10N.getStr("outline.noAtRules")
        : L10N.getStr("outline.noFunctions");
    } else {
      placeholderMessage = L10N.getStr("outline.noFileSelected");
    }
    return dom.div(
      {
        className: "outline-pane-info",
      },
      placeholderMessage
    );
  }

  renderLoading() {
    return dom.div(
      {
        className: "outline-pane-info",
      },
      L10N.getStr("loadingText")
    );
  }

  renderFunction(func) {
    const { focusedItem } = this.state;
    const { name, location, parameterNames } = func;
    const isFocused = focusedItem === func;
    return dom.li(
      {
        key: `${name}:${location.start.line}:${location.start.column}`,
        className: classnames("outline-list__element", {
          focused: isFocused,
        }),
        ref: el => {
          if (isFocused) {
            this.focusedElRef = el;
          }
        },
        onClick: () => this.selectItem(func),
        onContextMenu: e => this.onContextMenu(e, func),
      },
      dom.span(
        {
          className: "outline-list__element-icon",
        },
        "λ"
      ),
      React.createElement(PreviewFunction, {
        func: {
          name,
          parameterNames,
        },
      })
    );
  }

  renderClassHeader(klass) {
    return dom.div(
      null,
      dom.span(
        {
          className: "keyword",
        },
        "class"
      ),
      " ",
      klass
    );
  }

  renderClassFunctions(klass, functions) {
    const { symbols } = this.state;

    if (!symbols || klass == null || !functions.length) {
      return null;
    }

    const { focusedItem } = this.state;
    const classFunc = functions.find(func => func.name === klass);
    const classFunctions = functions.filter(func => func.klass === klass);
    const classInfo = symbols.classes.find(c => c.name === klass);

    const item = classFunc || classInfo;
    const isFocused = focusedItem === item;

    return dom.li(
      {
        className: "outline-list__class",
        ref: el => {
          if (isFocused) {
            this.focusedElRef = el;
          }
        },
        key: klass,
      },
      dom.h2(
        {
          className: classnames({
            focused: isFocused,
          }),
          onClick: () => this.selectItem(item),
        },
        classFunc
          ? this.renderFunction(classFunc)
          : this.renderClassHeader(klass)
      ),
      dom.ul(
        {
          className: "outline-list__class-list",
        },
        classFunctions.map(func => this.renderFunction(func))
      )
    );
  }

  renderFunctions(functions) {
    const { filter } = this.state;
    let classes = [...new Set(functions.map(({ klass }) => klass))];
    const namedFunctions = functions.filter(
      ({ name, klass }) =>
        filterOutlineItem(name, filter) && !klass && !classes.includes(name)
    );
    const classFunctions = functions.filter(
      ({ name, klass }) => filterOutlineItem(name, filter) && !!klass
    );

    if (this.props.alphabetizeOutline) {
      const sortByName = (a, b) => (a.name < b.name ? -1 : 1);
      namedFunctions.sort(sortByName);
      classes = classes.sort();
      classFunctions.sort(sortByName);
    }
    return dom.ul(
      {
        ref: "outlineList",
        className: "outline-list devtools-monospace",
      },
      namedFunctions.map(func => this.renderFunction(func)),
      classes.map(klass => this.renderClassFunctions(klass, classFunctions))
    );
  }

  renderConditionContent(atRule) {
    if (!atRule.conditionText) {
      return null;
    }

    // For non-media rules, we don't do anything more than displaying the conditionText
    // as there are no other condition text that would justify opening RDM at a specific
    // size (e.g. `@container` condition is relative to a container size, which varies
    // depending the node the rule applies to).
    if (atRule.type !== "media" || !this.props.isLocalTab()) {
      return dom.span({ className: "at-rule-details" }, atRule.conditionText);
    }

    const conditionContent = [];
    const minMaxPattern = /(min\-|max\-)(width|height):\s\d+(px)/gi;
    let match = minMaxPattern.exec(atRule.conditionText);
    let lastParsed = 0;
    while (match && match.index != minMaxPattern.lastIndex) {
      const matchEnd = match.index + match[0].length;
      conditionContent.push(
        dom.span(
          { className: "at-rule-details" },
          atRule.conditionText.substring(lastParsed, match.index)
        ),
        dom.a(
          {
            className: "at-rule-media-link",
            href: "#",
            onClick: e => this.onMediaConditionClick(e),
          },
          atRule.conditionText.substring(match.index, matchEnd)
        )
      );
      match = minMaxPattern.exec(atRule.conditionText);
      lastParsed = matchEnd;
    }
    conditionContent.push(
      dom.span(
        {
          className: "at-rule-details",
        },
        atRule.conditionText.substring(lastParsed, atRule.conditionText.length)
      )
    );
    return dom.span(
      {
        className: classnames("at-rule-details", {
          "media-condition-unmatched":
            atRule.type == "media" && !atRule.matches,
        }),
      },
      conditionContent
    );
  }

  renderAtRule(atRule) {
    return dom.li(
      {
        key: `${atRule.line}:${atRule.column}`,
        className: classnames("outline-list__element", "outline-list-at-rules"),
        onClick: () => this.selectItem(atRule),
      },
      dom.span(
        {
          className: "at-rule-label",
          href: "#",
        },
        `@${atRule.type}`,
        atRule.conditionText
          ? this.renderConditionContent(atRule)
          : dom.span(
              {
                className: "at-rule-details",
              },
              // @property
              atRule.propertyName ||
                // @position-try
                atRule.positionTryName ||
                // @layer
                atRule.layerName
            )
      )
    );
  }

  renderAtRules() {
    const { atRules } = this.props;
    const { filter } = this.state;
    const filteredAtRules = atRules.filter(atRule => {
      const ruleContent = formatAtRuleContent(atRule);
      return filterOutlineItem(ruleContent, filter);
    });
    return dom.ul(
      {
        ref: "outlineList",
        className: "outline-list devtools-monospace",
      },
      filteredAtRules.map(rule => this.renderAtRule(rule))
    );
  }

  renderFooter() {
    return dom.div(
      {
        className: "outline-footer",
      },
      dom.button(
        {
          onClick: this.props.onAlphabetizeClick,
          className: this.props.alphabetizeOutline ? "active" : "",
        },
        L10N.getStr("outline.sortLabel")
      )
    );
  }

  render() {
    const { selectedLocation, atRules } = this.props;
    const { filter, symbols } = this.state;

    if (!selectedLocation) {
      return this.renderPlaceholder();
    }

    if (selectedLocation.source.isStyleSheet) {
      if (!atRules.length) {
        return this.renderPlaceholder();
      }

      return dom.div(
        { className: "outline" },
        dom.div(
          null,
          React.createElement(OutlineFilter, {
            filter,
            updateFilter: this.updateFilter,
            selectedSource: selectedLocation.source,
          }),
          this.renderAtRules()
        )
      );
    }
    if (!symbols) {
      return this.renderLoading();
    }

    const { functions } = symbols;
    if (functions.length === 0) {
      return this.renderPlaceholder();
    }

    return dom.div(
      { className: "outline" },
      dom.div(
        null,
        React.createElement(OutlineFilter, {
          filter,
          updateFilter: this.updateFilter,
          selectedSource: selectedLocation.source,
        }),
        this.renderFunctions(functions),
        this.renderFooter()
      )
    );
  }
}

const mapStateToProps = state => {
  const selectedSourceTextContent = getSelectedSourceTextContent(state);
  const selectedLocation = getSelectedLocation(state);
  const atRules = selectedLocation
    ? getStyleSheetAtRules(state, selectedLocation.sourceActor.id)
    : [];
  return {
    selectedSourceTextContent,
    selectedLocation,
    canFetchSymbols:
      selectedSourceTextContent && isFulfilled(selectedSourceTextContent),
    atRules,
  };
};

export default connect(mapStateToProps, {
  selectLocation: actions.selectLocation,
  showOutlineContextMenu: actions.showOutlineContextMenu,
  getFunctionSymbols: actions.getFunctionSymbols,
  getClassSymbols: actions.getClassSymbols,
  launchResponsiveMode: actions.launchResponsiveMode,
  isLocalTab: actions.isLocalTab,
})(Outline);
