/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests the overflow behavior shared by chip rows.
 */

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_chip_overflow_page.html";

const WEBSITES = Array.from({ length: 5 }, (_, index) => ({
  url: `https://example.com/${index + 1}`,
  label: `Example Site ${index + 1}`,
}));

// The default widths declared by the test page.
const FIXTURE_WIDTHS = { wide: "900px", narrow: "400px" };

let gTestBrowser = null;

add_setup(async function () {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  gTestBrowser = tab.linkedBrowser;
  await SpecialPowers.spawn(gTestBrowser, [], async () => {
    await content.customElements.whenDefined("website-chip-container");
  });
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));
});

// Return the shared page to its initial state so tasks stay independent.
function resetFixture() {
  return SpecialPowers.spawn(gTestBrowser, [FIXTURE_WIDTHS], async widths => {
    for (const [id, inlineSize] of Object.entries(widths)) {
      content.document.getElementById(id).style.inlineSize = inlineSize;
    }
    for (const el of content.document.querySelectorAll(
      "website-chip-container"
    )) {
      el.autoOverflow = false;
      el.shouldGroupChips = false;
      el.visibleChipCount = null;
      el.chipType = "context-chip";
      el.chipSize = "default";
      el.removable = false;
      el.websites = [];
      await el.updateComplete;
    }
  });
}

// Set the chips on a container and wait for the measure to settle.
async function setChips(id, websites, autoOverflow = true) {
  await SpecialPowers.spawn(
    gTestBrowser,
    [id, websites, autoOverflow],
    async (elementId, items, overflow) => {
      const el = content.document.getElementById(elementId);
      el.autoOverflow = overflow;
      el.websites = items;
      await el.updateComplete;
      await content.wrappedJSObject.settleOverflow(el);
    }
  );
}

// Read the visible/overflow split from the rendered row.
function readRow(id) {
  return SpecialPowers.spawn(gTestBrowser, [id], async elementId =>
    content.wrappedJSObject.readOverflowRow(
      content.document.getElementById(elementId)
    )
  );
}

add_task(async function test_toggling_grouping_reapplies_overflow() {
  const readings = await SpecialPowers.spawn(
    gTestBrowser,
    [WEBSITES],
    async sites => {
      const el = content.document.getElementById("narrow-chips");
      el.autoOverflow = true;
      el.shouldGroupChips = true;
      el.websites = sites;
      await el.updateComplete;

      const settle = () => content.wrappedJSObject.settleOverflow(el);
      const read = () => ({
        grouped: !!el.shadowRoot.querySelector("ai-grouped-chip-container"),
        smartwindowOverflowRow: !!el.shadowRoot.querySelector(
          ".smartwindow-overflow-row"
        ),
        visibleCount: el.visibleCount,
      });

      await settle();
      const asGrouped = read();

      // Ungrouping must re-measure and correctly update
      el.shouldGroupChips = false;
      await el.updateComplete;
      await settle();
      return { asGrouped, asOverflow: read() };
    }
  );

  Assert.ok(
    readings.asGrouped.grouped,
    "Grouping takes precedence when enabled"
  );
  Assert.ok(
    !readings.asGrouped.smartwindowOverflowRow,
    "No overflow row is rendered while grouped"
  );
  Assert.ok(
    readings.asOverflow.smartwindowOverflowRow,
    "Turning grouping off renders the overflow row"
  );
  Assert.less(
    readings.asOverflow.visibleCount,
    WEBSITES.length,
    "The row measured itself after grouping was turned off"
  );

  await resetFixture();
});

add_task(async function test_all_chips_fit_when_wide() {
  await setChips("wide-chips", WEBSITES);
  const row = await readRow("wide-chips");

  Assert.ok(row.isSmartwindowOverflowRow, "Should render the overflow row");
  Assert.equal(row.total, WEBSITES.length, "All chips stay in the DOM");
  Assert.equal(
    row.visible,
    WEBSITES.length,
    "All chips are visible at a wide width"
  );
  Assert.ok(
    row.buttonHidden,
    "The “+n more” button is out of flow when nothing overflows"
  );
  Assert.ok(!row.hasPanel, "No panel is rendered when nothing overflows");

  await resetFixture();
});

add_task(async function test_chips_collapse_when_narrow() {
  await setChips("narrow-chips", WEBSITES);
  const row = await readRow("narrow-chips");

  Assert.ok(row.isSmartwindowOverflowRow, "Should render the overflow row");
  Assert.equal(
    row.total,
    WEBSITES.length,
    "Overflowing chips stay in the DOM so they remain measurable"
  );
  Assert.less(
    row.visible,
    WEBSITES.length,
    "Some chips overflow at a narrow width"
  );
  Assert.greaterOrEqual(
    row.visible,
    1,
    "A chip still fits beside the button at this width"
  );
  Assert.ok(!row.buttonHidden, "The “+n more” button is shown");
  Assert.equal(
    row.buttonLabel,
    `+${WEBSITES.length - row.visible} more`,
    "The button counts exactly the overflowing chips"
  );
  Assert.ok(row.hasPanel, "A panel holds the overflowing chips");

  await resetFixture();
});

add_task(async function test_row_regrows_when_width_returns() {
  await setChips("narrow-chips", WEBSITES);
  const narrow = await readRow("narrow-chips");
  Assert.less(narrow.visible, WEBSITES.length, "Starts collapsed");

  await SpecialPowers.spawn(
    gTestBrowser,
    [FIXTURE_WIDTHS.wide],
    async inlineSize => {
      content.document.getElementById("narrow").style.inlineSize = inlineSize;
      const el = content.document.getElementById("narrow-chips");
      await content.wrappedJSObject.settleOverflow(el);
    }
  );

  const widened = await readRow("narrow-chips");
  Assert.equal(
    widened.visible,
    WEBSITES.length,
    "All chips return inline once there is room again"
  );
  Assert.ok(widened.buttonHidden, "The “+n more” button goes back out of flow");

  await resetFixture();
});

add_task(async function test_nothing_spills_at_very_narrow_widths() {
  await setChips("narrow-chips", WEBSITES);

  // Below the width where a chip fits beside the button, only it remains.
  for (const width of [100, 150, 200, 240]) {
    const row = await SpecialPowers.spawn(
      gTestBrowser,
      [width],
      async inlineSize => {
        content.document.getElementById("narrow").style.inlineSize =
          `${inlineSize}px`;
        const el = content.document.getElementById("narrow-chips");
        await content.wrappedJSObject.settleOverflow(el);

        const container = el.shadowRoot.querySelector(
          ".chip-container-scroller"
        );
        const button = container.querySelector(".overflow-more");
        const bounds = container.getBoundingClientRect();
        const visible = [
          ...container.querySelectorAll(":scope > [role='listitem']"),
        ].filter(item => !item.hasAttribute("data-overflow"));
        const buttonShown = !!button && !button.hasAttribute("data-overflow");
        const overflowsRight = node =>
          node.getBoundingClientRect().right > bounds.right + 1;

        return {
          ...content.wrappedJSObject.readOverflowRow(el),
          buttonShown,
          fits: [...visible, ...(buttonShown ? [button] : [])].every(
            node => !overflowsRight(node)
          ),
          spills: visible.some(overflowsRight),
          buttonClipped: buttonShown && overflowsRight(button),
        };
      }
    );

    Assert.ok(!row.spills, `No chip spills outside the row at ${width}px`);
    Assert.ok(
      !row.buttonClipped,
      `The “+n more” button is not clipped at ${width}px`
    );
    Assert.ok(
      row.buttonShown,
      `The “+n more” button is the fallback at ${width}px`
    );
    Assert.less(
      row.visible,
      WEBSITES.length,
      `Chips are collapsed rather than kept at ${width}px`
    );
    Assert.ok(
      row.fits,
      `Everything left in flow stays inside the row at ${width}px`
    );
  }

  await resetFixture();
});

add_task(async function test_fixed_count_creates_no_resize_observer() {
  const trio = WEBSITES.slice(0, 3);
  const built = await SpecialPowers.spawn(gTestBrowser, [trio], async sites => {
    const doc = content.document;
    const settle = el => content.wrappedJSObject.settleOverflow(el);

    // Count ResizeObserver constructions while each mode initializes.
    const observer = content.ResizeObserver;
    let count = 0;
    const wrappers = [];
    Object.defineProperty(content, "ResizeObserver", {
      value: new content.Proxy(observer, {
        construct(target, args) {
          count++;
          return new target(...args);
        },
      }),
      configurable: true,
      writable: true,
    });

    try {
      const make = async fixedCount => {
        const wrapper = doc.createElement("div");
        wrapper.style.inlineSize = "400px";
        const el = doc.createElement("website-chip-container");
        el.autoOverflow = true;
        if (fixedCount != null) {
          el.visibleChipCount = fixedCount;
        }
        el.websites = sites;
        wrapper.append(el);
        doc.body.append(wrapper);
        wrappers.push(wrapper);
        await el.updateComplete;
        await settle(el);
        return el;
      };

      count = 0;
      const fixed = await make(2);
      const fixedCount = count;

      count = 0;
      await make(null);
      const widthAwareCount = count;

      // Switching a fixed row to width-aware should create one lazily.
      count = 0;
      fixed.visibleChipCount = null;
      await fixed.updateComplete;
      await settle(fixed);

      return {
        fixed: fixedCount,
        widthAware: widthAwareCount,
        afterFlip: count,
      };
    } finally {
      Object.defineProperty(content, "ResizeObserver", {
        value: observer,
        configurable: true,
        writable: true,
      });
      wrappers.forEach(wrapper => wrapper.remove());
    }
  });

  Assert.equal(
    built.fixed,
    0,
    "A fixed-count row creates no ResizeObserver at all"
  );
  Assert.equal(
    built.widthAware,
    1,
    "A width-aware row creates one ResizeObserver"
  );
  Assert.equal(
    built.afterFlip,
    1,
    "Switching to width-aware creates the observer lazily"
  );
});

add_task(async function test_fixed_count_ignores_width() {
  const readings = await SpecialPowers.spawn(
    gTestBrowser,
    [WEBSITES.slice(0, 4), FIXTURE_WIDTHS.wide],
    async (sites, wideWidth) => {
      const wrapper = content.document.getElementById("narrow");
      const el = content.document.getElementById("narrow-chips");
      el.autoOverflow = true;
      el.visibleChipCount = 2;
      el.websites = sites;
      await el.updateComplete;

      const read = () => content.wrappedJSObject.readOverflowRow(el);
      const settle = () => content.wrappedJSObject.settleOverflow(el);

      await settle();
      const atStart = read();

      // A width that would collapse everything in width-aware mode.
      wrapper.style.inlineSize = "120px";
      await settle();
      const narrow = read();

      wrapper.style.inlineSize = wideWidth;
      await settle();
      const wide = read();

      // Switch row back to width-aware mode.
      el.visibleChipCount = null;
      await el.updateComplete;
      await settle();

      return { atStart, narrow, wide, widthAware: read() };
    }
  );

  Assert.equal(
    readings.atStart.visible,
    2,
    "Shows exactly the requested count"
  );
  Assert.equal(
    readings.atStart.buttonLabel,
    "+2 more",
    "The button counts the rest"
  );
  Assert.equal(
    readings.narrow.visible,
    2,
    "A narrow width does not change a fixed count"
  );
  Assert.equal(
    readings.wide.visible,
    2,
    "A wide width does not change a fixed count either"
  );
  Assert.equal(
    readings.widthAware.visible,
    4,
    "Clearing the count returns the row to measuring"
  );

  await resetFixture();
});

add_task(async function test_selecting_overflow_item_opens_link() {
  await setChips("narrow-chips", WEBSITES);

  const selection = await SpecialPowers.spawn(gTestBrowser, [], async () => {
    const el = content.document.getElementById("narrow-chips");
    const row = el.shadowRoot.querySelector(".chip-container-scroller");
    const visible = [
      ...row.querySelectorAll(":scope > [role='listitem']"),
    ].filter(item => !item.hasAttribute("data-overflow")).length;

    const panel = row.querySelector("smartwindow-panel-list");
    await panel.show();
    await panel.updateComplete;

    const list = panel.shadowRoot.querySelector("panel-list");
    const opened = new Promise(resolve =>
      el.addEventListener("AIChatContent:OpenLink", resolve, { once: true })
    );

    // First chip that overflowed.
    const item = panel.shadowRoot.querySelector("panel-item");
    const itemLabel = item.textContent.trim();
    item.click();

    const event = await opened;
    await panel.updateComplete;

    return {
      visible,
      itemLabel,
      detail: event.detail,
      panelHidden: !list.hasAttribute("open"),
    };
  });

  const firstOverflowed = WEBSITES[selection.visible];
  Assert.equal(
    selection.itemLabel,
    firstOverflowed.label,
    "Panel lists chips that overflow"
  );
  Assert.equal(
    selection.detail.url,
    firstOverflowed.url,
    "Selecting an overflow item opens the correct URL"
  );
  Assert.ok(
    selection.detail.preferSwitchToTab,
    "Prefers switching to an open tab"
  );
  Assert.ok(selection.panelHidden, "Panel closes after a selection");

  await resetFixture();
});

add_task(async function test_opt_out_keeps_plain_row() {
  await setChips("narrow-chips", WEBSITES, /* autoOverflow */ false);
  const row = await readRow("narrow-chips");

  Assert.ok(
    !row.isSmartwindowOverflowRow,
    "Without autoOverflow the row keeps its existing markup"
  );
  Assert.equal(row.buttonHidden, null, "No “+n more” button is rendered");

  await resetFixture();
});
