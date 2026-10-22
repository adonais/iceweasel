/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Smartbar tab group mentions in Smart Window.
 */

"use strict";

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const GROUP_ONE = { label: "Group one", color: "blue" };
const GROUP_TWO = { label: "Group two", color: "red" };
const URL_ONE = "https://example.com/one";
const URL_TWO = "https://example.com/two";
const URL_THREE = "https://example.com/three";

function addContextMentions(browser, mentions) {
  return SpecialPowers.spawn(browser, [mentions], async chips => {
    const smartbar = content.document
      .querySelector("ai-window")
      .shadowRoot.querySelector("#ai-window-smartbar");
    for (const chip of chips) {
      smartbar.addContextMention(chip);
    }
  });
}

function sentMentions(conversation, index) {
  return userMessages(conversation)[index].content.contextMentions.map(
    ({ type, url, groupId, groupLabel }) => ({ type, url, groupId, groupLabel })
  );
}

function userMessages(conversation) {
  return conversation.messages.filter(
    message => message.content?.contextMentions?.length
  );
}

add_task(async function test_tab_group_context_mentions() {
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();
  const conversation = AIWindow.getActiveConversation(win);

  try {
    const browser = win.gBrowser.selectedBrowser;
    const groupOne = await addTabsInNewGroup(win, [URL_ONE], GROUP_ONE);
    const groupTwo = await addTabsInNewGroup(win, [URL_TWO], GROUP_TWO);
    const groupOneMention = {
      type: "tabGroup",
      groupId: groupOne.id,
      ...GROUP_ONE,
    };
    const groupTwoMention = {
      type: "tabGroup",
      groupId: groupTwo.id,
      ...GROUP_TWO,
    };

    // Selecting a tab group from the panel is wired up in bug 2059787, so the
    // chip and the inline mention are added through the smartbar API here.
    await SpecialPowers.spawn(
      browser,
      [groupOneMention, groupTwoMention],
      async (chipOne, chipTwo) => {
        const smartbar = content.document
          .querySelector("ai-window")
          .shadowRoot.querySelector("#ai-window-smartbar");
        smartbar.addContextMention(chipOne);
        smartbar.addContextMention(chipTwo);
        smartbar.addContextMention({ ...chipOne, label: "Added twice" });
        for (const chip of [chipOne, chipTwo]) {
          smartbar.inputField.insertMention(
            {
              type: "tabGroup",
              id: `group:${chip.groupId}`,
              label: chip.label,
            },
            0
          );
        }
      }
    );
    Assert.deepEqual(
      (await getSmartbarContextChips(browser)).map(chip => chip.groupId),
      [groupOne.id, groupTwo.id],
      "A tab group is added once, keyed by group id"
    );

    await removeSmartbarContextChip(browser, GROUP_TWO.label);
    Assert.deepEqual(
      (await getSmartbarContextChips(browser)).map(chip => chip.groupId),
      [groupOne.id],
      "The chip's remove button removes only that tab group"
    );

    const tab = BrowserTestUtils.addTab(
      win.gBrowser,
      "data:text/html,<title>Tab</title>"
    );
    await BrowserTestUtils.waitForMutationCondition(
      tab,
      { attributeFilter: ["label"] },
      () => tab.label == "Tab"
    );
    await openTabContextMenuAndClickTabByLabel(browser, "Tab");
    Assert.deepEqual(
      (await getSmartbarContextChips(browser)).map(chip => chip.label),
      [GROUP_ONE.label, "Tab"],
      "A tab is added next to the tab group"
    );

    await removeSmartbarContextChip(browser, "Tab");
    Assert.deepEqual(
      (await getSmartbarContextChips(browser)).map(chip => chip.label),
      [GROUP_ONE.label],
      "Removing a tab chip keeps the tab group"
    );

    await typeInSmartbar(browser, " summarize these");
    await submitSmartbar(browser);
    await mockEngineManager.respondTo({ purpose: "chat", response: "ok" });

    const sent = userMessages(conversation)[0].content.contextMentions;
    Assert.deepEqual(
      sent.slice(0, 2),
      [groupOneMention, groupTwoMention],
      "A group mentioned as a chip and inline is sent once, and an inline-only group resolves the open group's color"
    );
    Assert.deepEqual(
      sentMentions(conversation, 0).slice(2),
      [
        {
          type: "tab",
          url: URL_ONE,
          groupId: groupOne.id,
          groupLabel: GROUP_ONE.label,
        },
        {
          type: "tab",
          url: URL_TWO,
          groupId: groupTwo.id,
          groupLabel: GROUP_TWO.label,
        },
      ],
      "Each group is expanded to its tabs"
    );
    Assert.ok(
      ![...conversation.seenUrls].some(url => url.startsWith("group:")),
      "Tab group mention ids are not recorded as seen URLs"
    );
  } finally {
    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_expanded_tab_group_members() {
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();
  const conversation = AIWindow.getActiveConversation(win);

  try {
    const browser = win.gBrowser.selectedBrowser;
    const groupOne = await addTabsInNewGroup(
      win,
      [URL_ONE, URL_TWO],
      GROUP_ONE
    );
    const groupTwo = await addTabsInNewGroup(win, [URL_THREE], GROUP_TWO);
    await addContextMentions(browser, [
      { type: "tabGroup", groupId: groupOne.id, ...GROUP_ONE },
      { type: "tab", url: URL_TWO, label: "Two" },
      { type: "tabGroup", groupId: groupTwo.id, ...GROUP_TWO },
    ]);
    // Closing its only tab closes group two.
    BrowserTestUtils.removeTab(groupTwo.tabs[0]);

    await typeInSmartbar(browser, "compare these");
    await submitSmartbar(browser);
    await mockEngineManager.respondTo({ purpose: "chat", response: "ok" });

    Assert.deepEqual(
      sentMentions(conversation, 0),
      [
        {
          type: "tabGroup",
          url: undefined,
          groupId: groupOne.id,
          groupLabel: undefined,
        },
        {
          type: "tab",
          url: URL_TWO,
          groupId: undefined,
          groupLabel: undefined,
        },
        {
          type: "tabGroup",
          url: undefined,
          groupId: groupTwo.id,
          groupLabel: undefined,
        },
        {
          type: "tab",
          url: URL_ONE,
          groupId: groupOne.id,
          groupLabel: GROUP_ONE.label,
        },
      ],
      "A single tab mentioned is not added as a member again and a closed group has no members"
    );
    Assert.deepEqual(
      await getUserMessageChipTypes(browser, 0),
      ["tabGroup", "tab", "tabGroup"],
      "The sent message shows the groups and the tab"
    );

    await addContextMentions(browser, [
      { type: "tabGroup", groupId: groupOne.id, ...GROUP_ONE },
    ]);
    await SpecialPowers.spawn(browser, [], () => {
      content.document
        .querySelector("ai-window")
        .onQuickPromptClicked("summarize these", false);
    });
    await mockEngineManager.respondTo({ purpose: "chat", response: "ok" });
    Assert.ok(
      sentMentions(conversation, 1).some(
        ({ type, url, groupId }) =>
          type == "tab" && url == URL_ONE && groupId == groupOne.id
      ),
      "A quick prompt expands the tab group chips of the header"
    );
  } finally {
    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
  }
});
