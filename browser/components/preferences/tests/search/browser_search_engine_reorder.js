/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);
const { SearchUtils } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchUtils.sys.mjs"
);

SearchTestUtils.init(this);

const CONFIG = [
  { identifier: "a" },
  { identifier: "b" },
  { identifier: "c" },
  { identifier: "d" },
  { identifier: "e" },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["identity.fxaccounts.account.device.name", ""]],
  });
  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG);
});

async function openSearchPane() {
  await openPreferencesViaOpenPreferencesAPI("search", { leaveOpen: true });
  let doc = gBrowser.contentDocument;
  return { win: gBrowser.contentWindow, doc, tab: gBrowser.selectedTab };
}

async function reorderEngine({
  win,
  boxGroup,
  draggedEngine,
  targetEngine,
  position,
}) {
  let draggedItem = boxGroup.querySelector(
    `moz-box-item[label="${draggedEngine.name}"]`
  );
  let targetItem = boxGroup.querySelector(
    `moz-box-item[label="${targetEngine.name}"]`
  );

  let changed = SearchTestUtils.promiseSearchNotification(
    SearchUtils.MODIFIED_TYPE.CHANGED,
    SearchUtils.TOPIC_ENGINE_MODIFIED
  );

  performDragAndDrop({
    contentWindow: win,
    dragItem: draggedItem.handleEl,
    targetItem,
    position,
  });

  await changed;
}

add_task(async function test_reordering_engines_position_before() {
  let { win, tab } = await openSearchPane();

  let boxGroupControl = await settingControlRenders("engineList", win);
  let boxGroup = boxGroupControl.controlEl;

  let engines = await SearchService.getEngines();
  await boxGroup.updateComplete;

  const expectedOrder = [
    engines[1].name,
    engines[2].name,
    engines[0].name,
    engines[3].name,
    engines[4].name,
  ];

  await reorderEngine({
    win,
    boxGroup,
    draggedEngine: engines[0],
    targetEngine: engines[3],
    position: "before",
  });

  Assert.deepEqual(
    (await SearchService.getEngines()).map(e => e.name),
    expectedOrder,
    `${engines[0].name} should land before ${engines[3].name}`
  );

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_reordering_engines_position_after_from_end() {
  let { win, tab } = await openSearchPane();

  let boxGroupControl = await settingControlRenders("engineList", win);
  let boxGroup = boxGroupControl.controlEl;

  let engines = await SearchService.getEngines();
  await boxGroup.updateComplete;

  const expectedOrder = [
    engines[0].name,
    engines[1].name,
    engines[4].name,
    engines[2].name,
    engines[3].name,
  ];
  await reorderEngine({
    win,
    boxGroup,
    draggedEngine: engines[4],
    targetEngine: engines[1],
    position: "after",
  });

  Assert.deepEqual(
    (await SearchService.getEngines()).map(e => e.name),
    expectedOrder,
    `${engines[4].name} should land after ${engines[1].name}`
  );

  await BrowserTestUtils.removeTab(tab);
});
