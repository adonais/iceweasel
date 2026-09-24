/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The tab strip's custom elements, as the modules that drive them see them.
// content/tab.js is loaded as a subscript, so nothing can import its class and
// the interfaces below stand in for it and for the label element, which has no
// class at all. Nothing checks an interface against the element it describes: a
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
  _labelIsInitialTitle: boolean;
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

type MozTabbrowserTabGroup =
  import("../content/tabgroup.mjs").MozTabbrowserTabGroup;

interface MozTabbrowserTabGroupLabel extends XULElement {
  // Constant, as on the tab group the label stands in for. The label is a plain
  // element with no class of its own, so tabgroup.mjs assigns all four.
  pinned: false;
  splitview: null;

  container: any;
  group: MozTabbrowserTabGroup;
}

type MozTabSplitViewWrapper =
  import("../content/tabsplitview.mjs").MozTabSplitViewWrapper;

// What a split view contributes to session state, as its `state` getter builds
// it and sessionstore stores it.
type TabSplitViewStateData =
  import("../content/tabsplitview.mjs").TabSplitViewStateData;
