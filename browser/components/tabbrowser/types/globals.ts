/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Types the tabbrowser modules name in their JSDoc. Defining them here saves
// every module an `@import` of its own.

type TabMetricsContext = import("../TabMetrics.sys.mjs").TabMetricsContext;
type TabGroupId = import("../../sessionstore/TabGroupState.sys.mjs").TabGroupId;
type TabGroupStateData =
  import("../../sessionstore/TabGroupState.sys.mjs").TabGroupStateData;

// TaskbarTabsRegistry keeps its entry class private to Web Apps.
// TODO(bug 2066310): the tabbrowser has no business holding one.
type TaskbarTab = any;

// The generated XPIDL declarations only reach this enum through the interface
// that uses it, and JSDoc's parser rejects an indexed access type.
type nsILoadInfo_SchemelessInputType = nsILoadInfo["schemelessInput"];

// Session state TypeScript cannot reach: sessionstore names TabStateData in its
// JSDoc without defining it anywhere, and TabSplitViewStateData is declared in
// subscript-loaded tabsplitview.js, which nothing can import.
type TabStateData = any;
type TabSplitViewStateData = any;
