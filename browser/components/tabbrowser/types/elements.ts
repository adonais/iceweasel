/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The tab strip's custom elements, as the modules that drive them see them.
// content/tab.js, content/tabgroup.js and content/tabsplitview.js are loaded as
// subscripts, so nothing can import the classes and these interfaces stand in
// for them. Nothing checks an interface against the class it describes: a
// member that changes shape has to be changed here too.
//
// Projects outside browser/components/tabbrowser reach these by naming this
// file in their tsconfig `include`.

interface MozTabbrowserTab extends XULElement {
  linkedBrowser: MozBrowser;
  linkedPanel: string;
  permanentKey: object;
  container: any;
  group: MozTabbrowserTabGroup | null;
  splitview: MozTabSplitViewWrapper | null;
  owner: MozTabbrowserTab | null;
  successor: MozTabbrowserTab | null;
  predecessors: Set<MozTabbrowserTab>;
  tabs: MozTabbrowserTab[];
  pinned: boolean;
  visible: boolean;
  selected: boolean;
  multiselected: boolean;
  closing: boolean;
  soundPlaying: boolean;
  hasTabNote: boolean;
  initializingTab: boolean;
  removedByAdoption: boolean;
  index: number;
  elementIndex: number;
  userContextId: number;
  label: string;
  canonicalUrl: string;
  muteReason: any;
  initialize(): void;
  setUserContextId(id: number): void;
  _mouseenter(options?: { withoutPointerEvent?: boolean }): void;
  _mouseleave(): void;

  // Set on the element by the modules rather than declared by tab.js.
  _index: number;
  _hover: boolean;
  _fullyOpen: boolean;
  _fullLabel: string;
  _labelIsContentTitle: boolean;
  _pinnedUnscrollable: boolean;
  _pendingPermitUnload: boolean;
  _closedInMultiselection: boolean;
  _soundPlayingAttrRemovalTimer: number;
  _closeTimeAnimTimerId: any;
  _closeTimeNoAnimTimerId: any;
  _findBar: any;
  _pendingFindBar: any;
  _endRemoveArgs: any;
  _browserParams: any;
  _originalRegisteredOpenURI: any;
}

// The colours the group menu offers, which is the whole set: tabgroup.js
// interpolates the code into `var(--tab-group-${code})`, so anything else
// resolves to no colour at all.
type TabGroupColor =
  | "blue"
  | "purple"
  | "cyan"
  | "orange"
  | "yellow"
  | "pink"
  | "green"
  | "gray"
  | "red";

interface MozTabbrowserTabGroup extends XULElement {
  tabs: MozTabbrowserTab[];
  tabsAndSplitViews: (MozTabbrowserTab | MozTabSplitViewWrapper)[];
  label: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
  saveOnWindowClose: boolean;
  removedByAdoption: boolean;
  select(): void;
  addTabs(
    tabsOrSplitViews: (MozTabbrowserTab | MozTabSplitViewWrapper)[],
    metricsContext?: import("../TabMetrics.sys.mjs").TabMetricsContext
  ): void;
}

interface MozTabbrowserTabGroupLabel extends XULElement {
  container: any;
  group: MozTabbrowserTabGroup;
}

interface MozTabSplitViewWrapper extends XULElement {
  tabs: MozTabbrowserTab[];
  splitViewId: number;
  state: { id: number; numberOfTabs: number };
  group: MozTabbrowserTabGroup | null;
  pinned: boolean;
  visible: boolean;
  multiselected: boolean;
  hasActiveTab: boolean;
  shouldMoveAllTabsAtOnce: boolean;
  addTabs(
    tabs: MozTabbrowserTab[],
    options?: { isSessionRestore?: boolean; indexOfReplacedTab?: number }
  ): void;
  replaceTab(tabToReplace: MozTabbrowserTab, newTab: MozTabbrowserTab): void;
  unsplitTabs(trigger?: string): void;
  reverseTabs(trigger?: string): void;
  close(trigger?: string): void;
}
