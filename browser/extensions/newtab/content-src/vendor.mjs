/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMServer from "react-dom/server.browser";
import PropTypes from "prop-types";
import * as ReactTransitionGroup from "react-transition-group";
import * as ReactRedux from "react-redux";
import * as Redux from "redux";

const globalScope = typeof window !== "undefined" ? window : self;

globalScope.React = React;
globalScope.ReactDOM = ReactDOM;
globalScope.ReactDOMServer = ReactDOMServer;
globalScope.PropTypes = PropTypes;
globalScope.ReactTransitionGroup = ReactTransitionGroup;
globalScope.ReactRedux = ReactRedux;
globalScope.Redux = Redux;
