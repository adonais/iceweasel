# Tab events

`gBrowser` and the tab strip's custom elements report what happens to a tab by
dispatching DOM events on the tab and tab group elements. The generated
{doc}`api` covers none of them, because they are `dispatchEvent` calls rather
than class members, so this page is the vocabulary: where to register a
listener, what fires in what order, what each event carries, and which names are
internal plumbing.

## Where to register

A tab event is dispatched on the tab element and a tab group event on the
`<tab-group>` element, both bubbling. Either reaches `gBrowser.tabContainer` —
the `<tabs is="tabbrowser-tabs">` element, which contains the pinned strip, the
scrollable strip and the groups — and from there the window.

```js
gBrowser.tabContainer.addEventListener("TabOpen", event => {
  let tab = event.target;
  // ...
});
```

Three things a registration gets wrong:

- **`gBrowser.addEventListener()` hears almost none of them.** `gBrowser`
  forwards `addEventListener`, `removeEventListener` and `dispatchEvent` to
  `gBrowser.tabpanels`, which is in the content area and not on the path from a
  tab to the window.
- **`TabSwitched`, `TabSwitchDone` and `TabMultiSelect` are dispatched on
  `gBrowser.tabpanels`**, so they reach the window but never `tabContainer`.
  They are the three `gBrowser.addEventListener()` does hear, which is how
  `BrowserTestUtils.switchTab` waits for a switch.

```{mermaid}
:align: center
:caption: Which registration target sees which events.

---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TD
    tab["tab<br/>most Tab* events"]
    group["tab-group<br/>the tab group events"]
    container["gBrowser.tabContainer"]
    panels["gBrowser.tabpanels<br/>TabMultiSelect"]
    win["window"]

    tab --> container
    group --> container
    container --> win
    panels --> win

    classDef offstrip fill:#fef3c7,stroke:#92400e;
    class panels offstrip;
```

`window.addEventListener()` therefore catches every event below except
`TabSwapPictureInPicture`, which does not bubble and is internal anyway, so it is
the safe default; `tabContainer` is the narrower target and what most in-tree
consumers use, at the cost of the three above. Read `event.target`
for the tab or group the event is about rather than assuming
`gBrowser.selectedTab`.

Cancelling does nothing. `TabSwitchDone` is constructed with
`cancelable: true`, but no code reads `defaultPrevented` on any `Tab*` event.

## What fires when

Opening a foreground tab with `gBrowser.addTab(url, { inBackground: false })`:

1. `TabBrowserInserted`, with `detail.insertedOnTabCreation` true.
2. `TabOpen`.
3. The load starts. Its progress reaches the listeners described under
   {doc}`progress-listeners`, and `TabAttrModified` follows each consequence
   visible in the strip — `busy`, then `label`, `image` and `progress`.
4. `TabPinned`, if the tab was opened pinned.
5. `TabSelect` on the new tab, then `TabAttrModified` for `selected` on the old
   and new tabs.
6. `TabSwitchDone`, once the async tab switcher has settled
   ({doc}`async-tab-switcher`). Mostly a test's signal that a switch is over;
   `TabSwitched` precedes it and is narrower still.

Closing that tab dispatches `TabClose` before any teardown, so a listener can
still inspect the tab and its browser. Removing the element afterwards
dispatches `TabUngrouped` if the tab was in a group.

```{mermaid}
:align: center
:caption: What a tab dispatches, and which of it is conditional.

---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TD
    ins(["TabBrowserInserted"])
    open(["TabOpen"])
    live["the tab is open"]
    pin(["TabPinned"])
    sel(["TabSelect"])
    attr(["TabAttrModified"])
    close(["TabClose"])
    ungrouped(["TabUngrouped"])

    ins -- "eager tab; a lazy one<br/>gets this later" --> open
    open --> live
    live -- "if opened pinned" --> pin
    live -- "if opened in the foreground" --> sel
    live -- "on every state change" --> attr
    live --> close
    close -- "if grouped" --> ungrouped
```

Two paths depart from that order:

- **A lazy tab** (`createLazyBrowser`) reaches `TabOpen` with no browser in the
  document, and `TabBrowserInserted` arrives whenever something forces the
  browser in, carrying a falsy `detail.insertedOnTabCreation`. That flag is the
  only thing distinguishing the two cases.
- **Session restore** passes `insertTab: false` and creates its tabs outside the
  strip. `#insertBrowser` skips `TabBrowserInserted` for a tab that is not
  connected, so both events are dispatched for the whole batch once the tabs are
  in the DOM.

## TabOpen against TabBrowserInserted

`tab.linkedBrowser` is set before `TabOpen`, so its presence tells you nothing
about whether the browser is usable. What a lazy tab lacks is a browser *in the
document*: `tab.linkedPanel` is null, and most of the browser's properties are
substitutes that **insert the browser when they are read** — a docShell, an
`about:blank` load and a `TabBrowserInserted` caused by nothing but the listener
that looked. {doc}`lazy-browsers` covers which properties are safe and which are
not.

A listener that needs a real browser gates on `tab.linkedPanel` or waits for
`TabBrowserInserted`.

## TabBrowserDiscarded

By the time this fires, `discardBrowser` has aborted the tab's dialogs, reset
its sharing state, unhooked its progress listener and filter, destroyed the
browser, removed its panel and re-installed the lazy substitutes
({doc}`lazy-browsers`). The `<browser>` element survives as `tab.linkedBrowser`,
so a cached reference is not dangling — it is an element whose docShell and
browsing context are gone and whose properties will quietly build new ones. A
listener holding the browser,
its `browsingContext`, or anything keyed on either has to drop it here.

Discarding also clears the tab's now-stale `activemedia-blocked`, `busy`,
`pendingicon`, `progress` and `soundplaying` attributes, dispatching one
`TabAttrModified` for whichever of them were set.

## TabAttrModified

`detail.changed` is an array of the tab attribute names that just changed, drawn
from `activemedia-blocked`, `attention`, `busy`, `discarded`, `image`, `label`,
`muted`, `pendingicon`, `pictureinpicture`, `progress`, `selected`, `sharing`,
`soundplaying`, `soundplaying-scheduledremoval`, `undiscardable`,
`usercontextid` and `visuallyselected`.

These are attributes on the tab element, so the event reports the strip's state
rather than the browser's. It covers neither `pinned`, which has `TabPinned` and
`TabUnpinned` of its own, nor a tab that is already `closing`, for which
`_tabAttrModified` returns without dispatching.

## The tab events

| Event | Target | `detail` | Fires when |
| --- | --- | --- | --- |
| `TabOpen` | tab | `fromExternal`, `adoptedTab` when the tab came from another window, plus whatever the caller passed as `addTab`'s `eventDetail` | A tab has been created and the tabbrowser is in a consistent enough state for a listener to open or close tabs of its own. |
| `TabBrowserInserted` | tab | `insertedOnTabCreation` | The tab's browser has been injected into `tabpanels` and wired to a progress listener. |
| `TabBrowserDiscarded` | tab | — | The tab's browser has been destroyed and replaced with lazy substitutes. |
| `BeforeTabRemotenessChange` / `TabRemotenessChange` | tab | — | Either side of swapping the tab's browser for one in a different content process. |
| `TabClose` | tab | `adoptedBy`, `skipSessionStore`, `metricsContext` | The tab is committed to closing, before any teardown. `adoptedBy` is the tab in another window taking it over. |
| `TabSelect` | tab | `previousTab` | The tab became the selected one. Suppressed while the tabbrowser is in preview mode. |
| `TabSwitchDone` | `tabpanels` | — | The switcher has finished and torn itself down, which is later than `TabSelect` — that fires when the selection changes, this when the switch is visually over. Almost every consumer is a test waiting for a switch to settle; the one in product is `tab-hover-preview.mjs`, re-enabling the tab transitions it suppressed for the duration. `Tabbrowser` dispatches it itself only when e10s is disabled, in which case there is no `TabSwitched`. |
| `TabAttrModified` | tab | `changed` | One of the tab's state attributes changed; see above. |
| `TabPinned` / `TabUnpinned` | tab | `metricsContext` | The tab was pinned or unpinned. |
| `TabShow` / `TabHide` | tab | — | The tab's `hidden` attribute changed, through `showTab` and `hideTab` or a session restore. A collapsed group's tabs are not hidden in this sense: they count as invisible through `tab.visible` without either event firing. |
| `TabMove` | tab | `previousTabState`, `currentTabState`, `metricsContext` | The tab's index, group or split view changed. Each state carries `tabIndex`, `elementIndex` for a visible tab, and `tabGroupId` and `splitViewId` where they apply. |
| `TabMultiSelect` | `tabpanels` | — | A batch of multi-select changes finished with something worth reporting. |
| `TabFindInitialized` | tab | — | A findbar was created for the tab. |

## Tab groups

Group events are dispatched on the `<tab-group>` element rather than on any tab,
so `event.target` is the group and `event.target.tabs` its members.

`TabGrouped` and `TabUngrouped` carry the tab as `detail` itself, not
`detail.tab`, because the extension API expects that. They come from the tab
element's `connectedCallback` and `disconnectedCallback` rather than from
`Tabbrowser`, which has three consequences:

- Moving a tab to another window runs both callbacks, so `TabUngrouped` fires in
  the old window and `TabGrouped` in the new one. Dispatching on the group is
  what makes that work at all, since the tab is detached from the DOM at the
  time ([Bug 1964152](https://bugzilla.mozilla.org/show_bug.cgi?id=1964152)).
- Closing a grouped tab fires `TabUngrouped` on the group it was in.
- Reordering a tab within its own group fires neither. `TabMove` is the event
  for that.

`TabGroupCreate` is the event to listen to for a new group; session store, the
`tabGroups` extension API, the tab strip and the all-tabs menu all use it. Its
two similarly named siblings are not notifications. `TabGroupCreateByUser` is how
the tabbrowser pops its own "name your group" editor — `on_TabGroupCreateByUser`
calls `openCreateModal` — so dispatching it performs a UI action rather than
reporting one, and `AutoTabGrouping` creates its already-named groups with
`isUserTriggered: false` to steer around that
([Bug 2024819](https://bugzilla.mozilla.org/show_bug.cgi?id=2024819) tracks
separating the editor trigger from the metrics context it rides on).
`TabGroupCreateDone` fires from the editor panel once the user keeps the group,
and exists for an ASRouter onboarding trigger.

| Event | `detail` | Fires when |
| --- | --- | --- |
| `TabGroupCreate` | `isAdoptingGroup` when the group came from another window | The group element initialized. Once per element, so a group moved between windows produces a second one. |
| `TabGrouped` / `TabUngrouped` | the tab | A tab joined or left the group. |
| `TabGroupCollapse` / `TabGroupExpand` | — | The group's `collapsed` state changed, before the animation. |
| `TabGroupUpdate` | — | The group's label or color changed to a different value. |
| `TabGroupMoved` | — | The group's position in the strip changed. |
| `TabGroupUngroup` | `metricsContext` | `ungroupTabs` is about to move every tab out of the group. |
| `TabGroupSaved` | `metricsContext` | The group has been handed to session store as a saved group. |
| `TabGroupRemoveRequested` | `skipSessionStore`, `metricsContext` | `removeTabGroup` is about to close the group's tabs, while they are still members, which is what lets session store record them. |
| `TabGroupRemoved` | — | The group's last tab left, just before the element removes itself. |

## Events that are internal plumbing

Most readers can skip this section. Each of these does have an audience, but in
every case it is one or two named consumers rather than anyone who wants to
know, and the reason differs from row to row -- so the column says who listens
instead of leaving them all as one category.

| Events | Who listens |
| --- | --- |
| `TabHoverStart`, `TabHoverEnd`, `TabGroupLabelHoverStart`, `TabGroupLabelHoverEnd`, `TabNoteIconHoverStart`, `TabNoteIconHoverEnd` | The strip talking to itself: the tab and group elements dispatch them and `tabs.js` drives the hover preview panel from them. |
| `TabAnimationEnd`, `TabGroupAnimationComplete` | `tabs.js` and the drag-and-drop code, and directly by name in a dozen strip tests -- `TabGroupAnimationComplete` also through `TabGroupTestUtils`. Waiting for an animation to finish is the only reason to reach for either. |
| `TabPreviewUpdated`, `TabPreviewThumbnailUpdated`, `TabGroupPreviewUpdated`, `TabNotePreviewUpdated` | `tab-hover-preview.mjs` and `browser_tab_preview.js`. A repaint has no other observer, which is what they exist for. |
| `TabSwitched` | `BrowserTestUtils.switchTab`, and nothing else -- so a test waits on it through the helper without ever naming it. It carries the tab as `detail.tab` and fires when the switcher has its layers ready, earlier than `TabSwitchDone` rather than superseded by it; the helper falls back to `TabSwitchDone` when the window is hidden, since a hidden browser dispatches no `TabSwitched` ([Bug 1977993](https://bugzilla.mozilla.org/show_bug.cgi?id=1977993)). |
| `TabSwapPictureInPicture` | `PictureInPicture.sys.mjs`, and nothing else. A private channel rather than a vocabulary: it does not bubble, that consumer registers on the tab element, and the `detail` is the tab receiving the state while the target is the tab losing it. |
| `TabGroupCreateByUser`, `TabGroupCreateDone` | The tabbrowser's own trigger for the "name your group" editor, and ASRouter's trigger for an onboarding message, both described above. `TabGroupCreateDone` is dispatched on the `<tabgroup-menu>` in the window's popupset, so it never reaches `tabContainer` either. |

## Split view

Split view dispatches `TabSplitViewActivate` and `TabSplitViewDeactivate` as its
panels enter and leave the content area, alongside `SplitViewCreated` and
`SplitViewRemoved`, which break the `Tab*` naming. These are not plumbing --
session store persists split view state from `TabSplitViewActivate` and ASRouter
triggers a message on it -- but split view is still changing shape, so this page
names them and stops there.

## Aggregating across windows

A consumer that wants tab changes for every window rather than one — a sidebar,
Firefox View — should not register on each window's `tabContainer` itself.
{searchfox}`getTabsTargetForWindow <browser/components/firefoxview/OpenTabs.sys.mjs>`
hands back an `EventTarget` that watches them all and coalesces `TabAttrModified`,
`TabClose`, `TabMove`, `TabOpen`, `TabPinned` and `TabUnpinned` into a single
debounced `TabChange`, with `TabSelect` and window activation folded into
`TabRecencyChange` beside it. Each carries `detail.windowIds` and
`detail.sourceEvents`.

## Waiting for an event in a test

`BrowserTestUtils.waitForEvent(gBrowser.tabContainer, "TabOpen")` is the general
form, and the tab helpers already wrap the common cases:
`BrowserTestUtils.openNewForegroundTab` waits for the tab to open and its load
to finish, and `BrowserTestUtils.waitForTabClosing` is `waitForEvent` on the
tab's own `TabClose`. Reach for a raw listener when the point of the test is the
event itself.
