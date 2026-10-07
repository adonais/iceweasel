/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Rendering tests for the individual AI Tab block components. Each component
// gets its own add_task here rather than its own file: they are props in,
// markup out, and a file each would mean a fresh browser session each in CI.
// Behaviour that crosses a process or database boundary belongs in
// browser_aitab_actions.js instead.
//
// The components are mounted bare in the about:smartpage document rather than
// through a stored page, so these stay independent of the page config shape.
// Note the mounting has to be repeated inside each content task: the task runs
// in the content process and cannot call helpers defined in this file.

const AITAB_TEST_PREF = "browser.smartwindow.aitab.enabled";

/**
 * Opens about:smartpage, where every AI Tab custom element is registered.
 *
 * @param {Function} task - Content task, receives the spawn args.
 * @param {Array} args - Structured-cloneable arguments for the task.
 */
async function withAITabDocument(task, args = []) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.enabled", true],
      [AITAB_TEST_PREF, true],
    ],
  });
  await BrowserTestUtils.withNewTab("about:smartpage", async browser => {
    await SpecialPowers.spawn(browser, args, task);
  });
  await SpecialPowers.popPrefEnv();
}

// The date itself is formatted in AITabParent and covered by
// test_AITabDate.js. The header only renders the label it is handed.
add_task(async function test_header_renders_the_created_label() {
  await withAITabDocument(
    async label => {
      await content.customElements.whenDefined("aitab-header");
      const element = content.document.createElement("aitab-header");
      content.document.body.append(element);
      const header = element.wrappedJSObject;

      header.createdAt = label;
      await header.updateComplete;

      Assert.equal(
        header.shadowRoot.querySelector(".aitab-eyebrow").textContent,
        label,
        "The eyebrow shows the label the parent formatted"
      );

      header.createdAt = "";
      await header.updateComplete;
      Assert.ok(
        !header.shadowRoot.querySelector(".aitab-eyebrow"),
        "No eyebrow is rendered without a label"
      );
    },
    ["Created Sep 1"]
  );
});

add_task(async function test_header_references() {
  await withAITabDocument(
    async tags => {
      await content.customElements.whenDefined("aitab-header");
      const element = content.document.createElement("aitab-header");
      content.document.body.append(element);
      const header = element.wrappedJSObject;
      await header.updateComplete;

      Assert.ok(
        !header.shadowRoot.querySelector("ai-grouped-chip-container"),
        "No chip container is rendered when there are no references"
      );

      header.references = Cu.cloneInto(tags, content);
      await header.updateComplete;

      // header is already the unwrapped object, so its shadow DOM query
      // returns raw content elements; no second unwrap is needed.
      const chips = header.shadowRoot.querySelector(
        "ai-grouped-chip-container"
      );
      Assert.ok(chips, "The chip container renders once there are references");
      Assert.deepEqual(
        chips.chips.map(chip => [chip.url, chip.label]),
        tags.map(tag => [tag.href, tag.title]),
        "Each tag becomes a chip keyed by href with its title as the label"
      );
      // ai-grouped-chip-container is shared with chat and defaults to chat's
      // event name, so without this the chip would open tags through
      // AIChatContent and the AITab actor would never hear about it.
      Assert.equal(
        chips.getAttribute("openLinkEvent"),
        "AITab:OpenLink",
        "The chip is wired to the AI Tab open-link event, not chat's"
      );
    },
    [
      [
        { title: "energy.gov", href: "https://energy.gov" },
        { title: "NEEP", href: "https://neep.org" },
      ],
    ]
  );
});

add_task(async function test_header_reference_count_label() {
  // Resolved text, not the l10n id: the string is in aiWindowContent.ftl,
  // which aitab.html has to load.
  await withAITabDocument(async () => {
    await content.customElements.whenDefined("aitab-header");
    const element = content.document.createElement("aitab-header");
    content.document.body.append(element);
    const header = element.wrappedJSObject;

    for (const [count, expected] of [
      [1, "1 Tag"],
      [3, "3 Tags"],
    ]) {
      header.references = Cu.cloneInto(
        Array.from({ length: count }, (_, i) => ({
          title: `example${i}.com`,
          href: `https://example${i}.com`,
        })),
        content
      );
      await header.updateComplete;

      const label = header.shadowRoot
        .querySelector("ai-grouped-chip-container")
        .shadowRoot.querySelector(".grouped-chips__label");

      await ContentTaskUtils.waitForCondition(
        () => label.textContent.trim() == expected,
        `${count} reference(s) reads as "${expected}"`
      );
      Assert.equal(label.textContent.trim(), expected, `Reads "${expected}"`);
    }
  });
});

add_task(async function test_list_groups() {
  await withAITabDocument(
    async groups => {
      await content.customElements.whenDefined("aitab-list");
      const element = content.document.createElement("aitab-list");
      content.document.body.append(element);
      const list = element.wrappedJSObject;
      await list.updateComplete;

      Assert.ok(
        !list.shadowRoot.querySelector(".aitab-list"),
        "Nothing is rendered before there are any groups"
      );

      list.title = "Kanazawa shortlist";
      list.groups = Cu.cloneInto(groups, content);
      await list.updateComplete;

      Assert.equal(
        list.shadowRoot.querySelector(".aitab-list-title").textContent.trim(),
        "Kanazawa shortlist",
        "The block title renders above the groups"
      );
      Assert.deepEqual(
        [...list.shadowRoot.querySelectorAll(".aitab-list-group")].map(group =>
          [
            group.querySelector(".aitab-list-group-heading")?.textContent ?? "",
            ...[...group.querySelectorAll(".aitab-list-item")].map(
              item => item.textContent
            ),
          ].map(text => text.trim())
        ),
        [
          ["Food", "Omicho market for lunch", "Kanazawa-style curry"],
          ["", "Kenroku-en at opening"],
        ],
        "Each group with items renders its heading, if any, over its items"
      );
    },
    [
      [
        {
          heading: "Food",
          items: [
            { text: "Omicho market for lunch" },
            { text: "Kanazawa-style curry" },
          ],
        },
        { items: [{ text: "Kenroku-en at opening" }] },
        // A group the model left empty would otherwise render as a heading
        // with nothing under it.
        { heading: "Practical", items: [] },
      ],
    ]
  );
});

add_task(async function test_list_layout() {
  await withAITabDocument(async () => {
    await content.customElements.whenDefined("aitab-list");
    const element = content.document.createElement("aitab-list");
    content.document.body.append(element);
    const list = element.wrappedJSObject;
    list.groups = Cu.cloneInto(
      [{ items: [{ text: "Sear the thighs" }] }],
      content
    );
    await list.updateComplete;

    Assert.equal(
      list.getAttribute("layout"),
      "column",
      "The intro sits above the groups unless the props say otherwise"
    );

    list.layout = "row";
    await list.updateComplete;

    Assert.equal(
      list.getAttribute("layout"),
      "row",
      "The layout reflects to the attribute the stylesheet selects on"
    );
  });
});

add_task(async function test_timeline_items() {
  await withAITabDocument(
    async items => {
      await content.customElements.whenDefined("aitab-timeline");
      const element = content.document.createElement("aitab-timeline");
      content.document.body.append(element);
      const timeline = element.wrappedJSObject;
      await timeline.updateComplete;

      Assert.ok(
        !timeline.shadowRoot.querySelector(".aitab-timeline"),
        "Nothing is rendered before there are any entries"
      );

      timeline.title = "Three days";
      timeline.items = Cu.cloneInto(items, content);
      await timeline.updateComplete;

      Assert.equal(
        timeline.shadowRoot
          .querySelector(".aitab-timeline-title")
          .textContent.trim(),
        "Three days",
        "The block title renders beside the entries"
      );
      Assert.deepEqual(
        [...timeline.shadowRoot.querySelectorAll(".aitab-timeline-item")].map(
          item =>
            [
              ".aitab-timeline-date-label",
              ".aitab-timeline-date-eyebrow",
              ".aitab-timeline-item-title",
              ".aitab-timeline-item-description",
            ].map(selector =>
              (item.querySelector(selector)?.textContent ?? "").trim()
            )
        ),
        [
          ["Thu, Oct 9", "Arrival", "Korinbo & the 21st Century Museum", ""],
          ["Fri, Oct 10", "", "Kenroku-en, castle, Nagamachi", "Garden first."],
        ],
        "Entries keep their order, and each field is left out when unset"
      );
      Assert.equal(
        timeline.shadowRoot.querySelector(".aitab-timeline-item-title")
          .localName,
        "h3",
        "Entry titles sit under the block title"
      );

      timeline.title = "";
      await timeline.updateComplete;

      Assert.equal(
        timeline.shadowRoot.querySelector(".aitab-timeline-item-title")
          .localName,
        "h2",
        "Entry titles step up a level when the block has no title of its own"
      );
    },
    [
      [
        {
          date_label: "Thu, Oct 9",
          date_eyebrow: "Arrival",
          title: "Korinbo & the 21st Century Museum",
        },
        {
          date_label: "Fri, Oct 10",
          title: "Kenroku-en, castle, Nagamachi",
          description: "Garden first.",
        },
        // An entry the model left without a date or a title has nothing to
        // show, and would otherwise render as a blank row.
        { description: "Somewhere, at some point." },
      ],
    ]
  );
});
