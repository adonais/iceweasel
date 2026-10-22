/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_website_chip_page.html";

/**
 * Opens a test page in a new tab.
 *
 * @param {string} pageUrl - The URL of the page to load
 * @returns {Promise<object>} - Object containing the tab and cleanup function
 */
async function openTestPage(pageUrl) {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, pageUrl);
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.customElements.whenDefined("ai-website-chip");
  });
  return { tab, browser: tab.linkedBrowser };
}

/**
 * Sets properties on a chip element in content and waits for update.
 *
 * @param {Browser} browser - The browser element
 * @param {string} chipId - The ID of the chip element
 * @param {object} props - Properties to set on the chip
 * @returns {Promise<void>}
 */
async function setChipPropsInContent(browser, chipId, props) {
  await SpecialPowers.spawn(
    browser,
    [chipId, props],
    async (id, properties) => {
      const chip = content.document.getElementById(id);
      Object.assign(chip, properties);
      if (chip.updateComplete) {
        await chip.updateComplete;
      }
    }
  );
}

add_task(async function test_website_chip_inline_empty_state() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await SpecialPowers.spawn(browser, [], async () => {
    const chip = content.document.getElementById("test-inline-chip");

    Assert.ok(chip, "Chip element should exist in the test page");
    Assert.equal(chip.type, "in-line", "Chip type should be in-line");
    Assert.equal(chip.label, "", "Chip label should be empty initially");

    const shadow = chip.shadowRoot;
    const placeholder = shadow.querySelector(".chip-label");
    Assert.ok(placeholder, "Placeholder label should exist");
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_website_chip_inline_with_label() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setChipPropsInContent(browser, "test-inline-chip", {
    label: "Mozilla Firefox",
    iconSrc: "chrome://branding/content/icon16.png",
  });

  await SpecialPowers.spawn(browser, [], async () => {
    const chip = content.document.getElementById("test-inline-chip");
    const shadow = chip.shadowRoot;
    const icon = shadow.querySelector(".chip-icon");
    const atSymbol = shadow.querySelector(".chip-at");
    const removeButton = shadow.querySelector(".chip-remove");

    Assert.ok(icon, "Icon should be rendered when iconSrc is set");
    Assert.ok(!atSymbol, "@ symbol should not be rendered when label is set");
    Assert.ok(!removeButton, "In-line chip should not have remove button");
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_website_chip_inline_click_event() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await setChipPropsInContent(browser, "test-inline-chip", {
    label: "Test Site",
  });

  await SpecialPowers.spawn(browser, [], async () => {
    const chip = content.document.getElementById("test-inline-chip");

    let clickEvent = null;
    chip.addEventListener("ai-website-chip:click", e => (clickEvent = e), {
      once: true,
    });

    const shadow = chip.shadowRoot;
    const chipDiv = shadow.querySelector(".chip");
    chipDiv.click();

    Assert.ok(clickEvent, "Click event should fire");
    Assert.equal(
      clickEvent.detail.label,
      "Test Site",
      "Event detail should include label"
    );
    Assert.equal(clickEvent.bubbles, true, "Event should bubble");
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_website_chip_context_remove() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await SpecialPowers.spawn(browser, [], async () => {
    const chip = content.document.getElementById("test-context-chip");

    Assert.equal(chip.type, "context-chip", "Chip type should be context-chip");
    Assert.equal(
      chip.label,
      "Example Site",
      "Label should be set from attribute"
    );

    const shadow = chip.shadowRoot;
    const removeButton = shadow.querySelector(".chip-remove");
    Assert.ok(removeButton, "Context chip should have remove button");

    const removeIcon = shadow.querySelector(".chip-remove-icon");
    Assert.ok(removeIcon, "Remove button should have icon");

    let removeEvent = null;
    chip.addEventListener("ai-website-chip:remove", e => (removeEvent = e), {
      once: true,
    });

    removeButton.click();

    Assert.ok(removeEvent, "Remove event should fire");
    Assert.equal(
      removeEvent.detail.label,
      "Example Site",
      "Event detail should include label"
    );
    Assert.equal(removeEvent.bubbles, true, "Event should bubble");
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_website_chip_context_with_link() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await SpecialPowers.spawn(browser, [], async () => {
    const chip = content.document.getElementById("test-context-chip-link");

    Assert.equal(chip.href, "https://mozilla.org", "Chip href should be set");

    const shadow = chip.shadowRoot;
    const link = shadow.querySelector("a.chip");

    Assert.ok(link, "Context chip with href should render as link");
    Assert.equal(
      link.getAttribute("href"),
      "https://mozilla.org",
      "Link should expose href for native browser features (copy link, middle-click)"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_website_chip_tab_group_icon() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await SpecialPowers.spawn(browser, [], async () => {
    const chip = content.document.getElementById("test-group-chip");
    await chip.updateComplete;
    const shadow = chip.shadowRoot;

    const icon = shadow.querySelector("tab-group-icon");
    Assert.ok(icon, "A tab group chip renders a tab group icon");
    Assert.equal(
      icon.shadowRoot.textContent.trim(),
      "T",
      "The icon shows the group label's initial"
    );
    const probe = content.document.createElement("div");
    probe.style.backgroundColor = "var(--tab-group-blue)";
    content.document.body.appendChild(probe);
    const expected = content.getComputedStyle(probe).backgroundColor;
    probe.remove();

    const iconStyle = content.getComputedStyle(icon);
    Assert.equal(
      iconStyle.backgroundColor,
      expected,
      "The icon paints the group color"
    );
    Assert.notEqual(
      iconStyle.backgroundColor,
      "rgba(0, 0, 0, 0)",
      "The group color resolves rather than falling back to transparent"
    );
    Assert.ok(
      !shadow.querySelector(".chip-icon"),
      "A tab group chip has no favicon"
    );
    Assert.equal(
      shadow.querySelector(".chip-label").textContent.trim(),
      "Trip planning",
      "The chip shows the group label"
    );
    Assert.ok(
      !shadow.querySelector("a.chip"),
      "A tab group chip is not a link, since it has no URL"
    );
  });

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_website_chip_tab_group_without_color() {
  const { tab, browser } = await openTestPage(TEST_PAGE);

  await SpecialPowers.spawn(browser, [], async () => {
    // A group that has been closed no longer reports a color, but the chip
    // still stands for a group rather than for a page.
    const chip = content.document.getElementById("test-group-chip");
    chip.tabGroupColor = "";
    await chip.updateComplete;
    const shadow = chip.shadowRoot;

    const icon = shadow.querySelector("tab-group-icon");
    await icon.updateComplete;
    Assert.ok(icon, "The chip still renders a tab group icon");
    Assert.ok(!shadow.querySelector(".chip-icon"), "And still has no favicon");

    const probe = content.document.createElement("div");
    probe.style.backgroundColor = "var(--tab-group-gray)";
    content.document.body.appendChild(probe);
    const expected = content.getComputedStyle(probe).backgroundColor;
    probe.remove();

    Assert.equal(
      content.getComputedStyle(icon).backgroundColor,
      expected,
      "The icon draws like a gray group rather than falling back to transparent"
    );
  });

  BrowserTestUtils.removeTab(tab);
});
