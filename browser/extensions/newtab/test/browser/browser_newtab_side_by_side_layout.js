"use strict";

/* global ContentTaskUtils */

/**
 * Tests the side-by-side layout variants (Bug 2061741), which split the
 * .content-full-width band into a content column and a single-widget-wide
 * widgets column. Story data is not fetched in mochitest-browser, so these
 * assertions cover the two columns' geometry rather than card contents.
 *
 * The seam between them carries both panel bleeds plus a gutter, so the pair
 * measures (4 + 4n) columns + (4n + 5) gaps for n cards. Test bodies run in the
 * content process and cannot see helpers from this scope, hence the repeated
 * local probe helpers.
 */

function resizeChromeWindowTo(width, height) {
  const initialWidth = window.outerWidth;
  const initialHeight = window.outerHeight;

  registerCleanupFunction(async () => {
    if (
      window.outerWidth !== initialWidth ||
      window.outerHeight !== initialHeight
    ) {
      const resized = BrowserTestUtils.waitForEvent(window, "resize", false);
      window.resizeTo(initialWidth, initialHeight);
      await resized;
    }
  });

  if (window.outerWidth !== width || window.outerHeight !== height) {
    const resized = BrowserTestUtils.waitForEvent(window, "resize", false);
    window.resizeTo(width, height);
    return resized;
  }
  return Promise.resolve();
}

function layoutPrefs(variant) {
  return [
    // @nova-cleanup(remove-pref): Drop this pref push; Nova is the only layout.
    ["browser.newtabpage.activity-stream.nova.enabled", true],
    ["browser.newtabpage.activity-stream.pageLayouts.variant", variant],
    ["browser.newtabpage.activity-stream.widgets.system.enabled", true],
    ["browser.newtabpage.activity-stream.widgets.enabled", true],
    ["browser.newtabpage.activity-stream.widgets.system.lists.enabled", true],
    ["browser.newtabpage.activity-stream.widgets.lists.enabled", true],
    ["browser.newtabpage.activity-stream.feeds.section.topstories", true],
    ["browser.newtabpage.activity-stream.feeds.system.topstories", true],
    [
      "browser.newtabpage.activity-stream.discoverystream.config",
      JSON.stringify({ collapsible: true, enabled: true }),
    ],
  ];
}

test_newtab({
  async before({ pushPrefs }) {
    await resizeChromeWindowTo(1400, 1000);
    await pushPrefs(...layoutPrefs("side-by-side-content-lead"));
  },

  test: async function test_side_by_side_content_lead() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    ok(
      band.classList.contains("side-by-side-content-lead"),
      "The assigned variant class is on the band"
    );

    // Clears the shortcuts above, which the row gap alone does not.
    Assert.equal(
      content.window.getComputedStyle(band).marginBlockStart,
      "15px",
      "The band is pushed clear of the shortcuts"
    );

    const column = content.document.querySelector(".layout-content-column");
    const widgets = content.document.querySelector(
      ".widgets-section-container"
    );
    ok(column, "The content column rendered");
    ok(widgets, "The widgets column rendered");

    // Measure a probe: --col-width computes to the unresolved "calc(300px / 4)"
    // token stream, and --space-medium is rem-based.
    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);
    // The side-by-side pair: widgets column + seam + n card tracks. See
    // at-band-fits-pair.
    const pairWidth = cards => span(4 + 4 * cards, 4 * cards + 5);

    Assert.greaterOrEqual(
      band.getBoundingClientRect().width,
      pairWidth(2),
      `Test window is wide enough for the side-by-side threshold ` +
        `(band=${band.getBoundingClientRect().width}, needs=${pairWidth(2)})`
    );

    // Empty without story data, so give it height for the vertical comparison.
    const spacer = content.document.createElement("div");
    spacer.style.cssText = "block-size: 600px; visibility: hidden;";
    column.appendChild(spacer);

    const columnRect = column.getBoundingClientRect();
    const widgetsRect = widgets.getBoundingClientRect();

    // LTR in tests, so inline-start is left.
    Assert.less(
      columnRect.left,
      widgetsRect.left,
      `Content leads: content column starts before the widgets ` +
        `(content=${columnRect.left}, widgets=${widgetsRect.left})`
    );
    Assert.lessOrEqual(
      columnRect.right,
      widgetsRect.left + 1,
      "The two columns do not overlap horizontally"
    );
    Assert.less(
      Math.abs(widgetsRect.width - colSpan(4)),
      2,
      `Widgets column is one widget wide ` +
        `(width=${widgetsRect.width}, expected=${colSpan(4)})`
    );
    Assert.greater(
      widgetsRect.bottom,
      columnRect.top,
      "The widgets sit beside the content column rather than below it"
    );
    Assert.less(
      Math.abs(widgetsRect.top - columnRect.top),
      2,
      "Both columns start on the same row"
    );

    // The leftover splits evenly between the outer edges and the seam is just the
    // grid gap. A 1fr column would put the whole remainder on one side.
    const bandRect = band.getBoundingClientRect();
    const gap = parseFloat(content.window.getComputedStyle(band).columnGap);
    const leadingRect = columnRect;
    const trailingRect = widgetsRect;

    Assert.less(
      Math.abs(trailingRect.left - leadingRect.right - gap),
      2,
      `Seam between the columns is exactly the grid gap ` +
        `(seam=${trailingRect.left - leadingRect.right}, gap=${gap})`
    );

    const startSlack = leadingRect.left - bandRect.left;
    const endSlack = bandRect.right - trailingRect.right;
    Assert.less(
      Math.abs(startSlack - endSlack),
      2,
      `Pair is centred in the band ` +
        `(startSlack=${startSlack}, endSlack=${endSlack})`
    );

    // layout-panel paints on a ::before that bleeds outward, so the seam carries both
    // bleeds plus the gap the panels should show. One gutter comes from the probe, not
    // the band's row-gap, which is itself widened to clear stacked bleeds.
    const bleedOf = el =>
      -parseFloat(content.window.getComputedStyle(el, "::before").left);
    const bleeds = bleedOf(widgets) + bleedOf(column);
    const gutter = span(0, 1);
    Assert.less(
      Math.abs(gap - bleeds - gutter),
      1,
      `Panels sit one gutter apart ` +
        `(seam=${gap}, bleeds=${bleeds}, clear=${gap - bleeds}, gutter=${gutter})`
    );

    // No wallpaper in the test profile, so the panels are outline-only. A
    // wallpaper swaps the border for a fill; see layout-panel.
    for (const [name, el] of [
      ["widgets", widgets],
      ["content", column],
    ]) {
      const panel = content.window.getComputedStyle(el, "::before");
      Assert.equal(
        panel.backgroundColor,
        "rgba(0, 0, 0, 0)",
        `${name} panel has no fill without a wallpaper`
      );
      Assert.notEqual(
        panel.borderTopColor,
        "rgba(0, 0, 0, 0)",
        `${name} panel is drawn as an outline instead (${panel.borderTopColor})`
      );

      // Equal padding on all four sides, one gutter each.
      const insets = [panel.top, panel.right, panel.bottom, panel.left].map(v =>
        parseFloat(v)
      );
      for (const inset of insets) {
        Assert.less(
          Math.abs(inset + gutter),
          1,
          `${name} panel pads by one gutter on every side ` +
            `(insets=${insets.join(", ")}, gutter=${gutter})`
        );
      }
    }

    // Whole card tracks, so the nested auto-fill grids have nothing to spread.
    const cards = Math.round((columnRect.width + gap) / (colSpan(4) + gap));
    Assert.less(
      Math.abs(columnRect.width - colSpan(4 * cards)),
      2,
      `Content column is ${cards} whole card tracks ` +
        `(width=${columnRect.width}, expected=${colSpan(4 * cards)})`
    );

    spacer.remove();
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await resizeChromeWindowTo(1400, 1000);
    await pushPrefs(...layoutPrefs("side-by-side-widgets-lead"));
  },

  test: async function test_side_by_side_widgets_lead() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    ok(
      band.classList.contains("side-by-side-widgets-lead"),
      "The widgets-lead variant class is on the band"
    );

    const column = content.document.querySelector(".layout-content-column");
    const widgets = content.document.querySelector(
      ".widgets-section-container"
    );
    // Measure a probe: --col-width computes to the unresolved "calc(300px / 4)"
    // token stream, and --space-medium is rem-based.
    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);

    const spacer = content.document.createElement("div");
    spacer.style.cssText = "block-size: 600px; visibility: hidden;";
    column.appendChild(spacer);

    const columnRect = column.getBoundingClientRect();
    const widgetsRect = widgets.getBoundingClientRect();

    Assert.less(
      widgetsRect.left,
      columnRect.left,
      `Widgets lead: widgets start before the content column ` +
        `(widgets=${widgetsRect.left}, content=${columnRect.left})`
    );
    Assert.less(
      Math.abs(widgetsRect.width - colSpan(4)),
      2,
      `Widgets column is still one widget wide ` +
        `(width=${widgetsRect.width}, expected=${colSpan(4)})`
    );

    // The leftover splits evenly between the outer edges and the seam is just the
    // grid gap. A 1fr column would put the whole remainder on one side.
    const bandRect = band.getBoundingClientRect();
    const gap = parseFloat(content.window.getComputedStyle(band).columnGap);
    const leadingRect = widgetsRect;
    const trailingRect = columnRect;

    Assert.less(
      Math.abs(trailingRect.left - leadingRect.right - gap),
      2,
      `Seam between the columns is exactly the grid gap ` +
        `(seam=${trailingRect.left - leadingRect.right}, gap=${gap})`
    );

    const startSlack = leadingRect.left - bandRect.left;
    const endSlack = bandRect.right - trailingRect.right;
    Assert.less(
      Math.abs(startSlack - endSlack),
      2,
      `Pair is centred in the band ` +
        `(startSlack=${startSlack}, endSlack=${endSlack})`
    );

    // layout-panel paints on a ::before that bleeds outward, so the seam carries both
    // bleeds plus the gap the panels should show. One gutter comes from the probe, not
    // the band's row-gap, which is itself widened to clear stacked bleeds.
    const bleedOf = el =>
      -parseFloat(content.window.getComputedStyle(el, "::before").left);
    const bleeds = bleedOf(widgets) + bleedOf(column);
    const gutter = span(0, 1);
    Assert.less(
      Math.abs(gap - bleeds - gutter),
      1,
      `Panels sit one gutter apart ` +
        `(seam=${gap}, bleeds=${bleeds}, clear=${gap - bleeds}, gutter=${gutter})`
    );

    // Whole card tracks, so the nested auto-fill grids have nothing to spread.
    const cards = Math.round((columnRect.width + gap) / (colSpan(4) + gap));
    Assert.less(
      Math.abs(columnRect.width - colSpan(4 * cards)),
      2,
      `Content column is ${cards} whole card tracks ` +
        `(width=${columnRect.width}, expected=${colSpan(4 * cards)})`
    );

    spacer.remove();
  },
});

test_newtab({
  async before({ pushPrefs }) {
    // Puts the band well under the --col-span(13) threshold once the
    // container's inline padding is taken off.
    await resizeChromeWindowTo(900, 1000);
    await pushPrefs(...layoutPrefs("side-by-side-content-lead"));
  },

  test: async function test_side_by_side_below_threshold() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    // Measure a probe: --col-width computes to the unresolved "calc(300px / 4)"
    // token stream, and --space-medium is rem-based.
    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);
    // The side-by-side pair: widgets column + seam + n card tracks. See
    // at-band-fits-pair.
    const pairWidth = cards => span(4 + 4 * cards, 4 * cards + 5);

    Assert.less(
      band.getBoundingClientRect().width,
      pairWidth(2),
      `Test window is narrower than the side-by-side threshold ` +
        `(band=${band.getBoundingClientRect().width}, threshold=${pairWidth(2)})`
    );

    const widgets = content.document.querySelector(
      ".widgets-section-container"
    );
    ok(widgets, "The widgets container is still in the DOM");
    Assert.equal(
      content.window.getComputedStyle(widgets).display,
      "none",
      "Widgets are dropped below the threshold so content gets the whole band"
    );

    // A real box so it can carry a panel, but sized to whole card tracks and
    // centred, so the panel frames the cards rather than the band.
    const column = content.document.querySelector(".layout-content-column");
    const columnWidth = column.getBoundingClientRect().width;
    Assert.lessOrEqual(
      columnWidth,
      band.getBoundingClientRect().width + 1,
      `The content column does not exceed the band ` +
        `(column=${columnWidth}, band=${band.getBoundingClientRect().width})`
    );
    // One gutter via the probe, not the band's row-gap, which is widened to clear
    // stacked panel bleeds.
    const gutter = span(0, 1);
    const cards = Math.round((columnWidth + gutter) / (colSpan(4) + gutter));
    Assert.less(
      Math.abs(columnWidth - colSpan(4 * cards)),
      2,
      `The content column is ${cards} whole card tracks ` +
        `(width=${columnWidth}, expected=${colSpan(4 * cards)})`
    );
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await resizeChromeWindowTo(1400, 1000);
    // Wide enough for side-by-side, but every widget is hidden.
    await pushPrefs(...layoutPrefs("side-by-side-content-lead"), [
      "browser.newtabpage.activity-stream.widgets.lists.enabled",
      false,
    ]);
  },

  test: async function test_side_by_side_with_no_widgets_recenters() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    ok(
      band.classList.contains("side-by-side-content-lead"),
      "The variant class stays, so the lone section keeps its panel"
    );
    ok(
      !band.classList.contains("side-by-side-active"),
      "Not active, so an empty widgets column cannot push content aside"
    );

    const column = content.document.querySelector(".layout-content-column");
    Assert.notEqual(
      content.window.getComputedStyle(column, "::before").borderTopColor,
      "rgba(0, 0, 0, 0)",
      "The lone content section is still framed"
    );
    Assert.equal(
      content.window.getComputedStyle(band).gridTemplateColumns.split(" ")
        .length > 2,
      true,
      "The band keeps its many-track auto-fill grid rather than two columns"
    );
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await pushPrefs(...layoutPrefs("side-by-side-widgets-lead-five"));
  },

  // The -five variants are the only ones that reach a fourth content card.
  test: async function test_side_by_side_five_variant_four_cards() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    // Chrome-window resizing tops out well below 1920px on Linux CI, and the layout
    // is container-query driven, so set the query container directly. border-box
    // plus the container's inline padding leaves outer-grid at 1855px.
    content.document.querySelector(".nova-enabled.container").style.inlineSize =
      "1900px";

    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);
    // The side-by-side pair: widgets column + seam + n card tracks. See
    // at-band-fits-pair.
    const pairWidth = cards => span(4 + 4 * cards, 4 * cards + 5);

    const bandWidth = band.getBoundingClientRect().width;
    Assert.greaterOrEqual(
      bandWidth,
      pairWidth(4),
      `Window is wide enough for the 4-card step ` +
        `(band=${bandWidth}, needs=${pairWidth(4)})`
    );

    const column = content.document.querySelector(".layout-content-column");
    Assert.less(
      Math.abs(column.getBoundingClientRect().width - colSpan(16)),
      2,
      `Content column is 4 cards wide ` +
        `(width=${column.getBoundingClientRect().width}, expected=${colSpan(16)})`
    );
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await pushPrefs(...layoutPrefs("side-by-side-widgets-lead"));
  },

  // Without side-by-side-five the pair tops out at three content cards, so both
  // the band cap and the content track stay a card narrower than the -five arm.
  test: async function test_side_by_side_four_column_variant_stops_at_three() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    // 1855px of outer-grid, past at-band-fits-pair(4), so the 4-card step would
    // engage if the variant allowed it. Set here rather than by resizing the window,
    // which cannot reach this width on Linux CI.
    content.document.querySelector(".nova-enabled.container").style.inlineSize =
      "1900px";

    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);
    const pairWidth = cards => span(4 + 4 * cards, 4 * cards + 5);

    ok(
      band.classList.contains("side-by-side-active"),
      "The two-column layout is active"
    );
    ok(
      !band.classList.contains("side-by-side-five"),
      "This variant carries no width modifier"
    );

    const bandWidth = band.getBoundingClientRect().width;
    Assert.less(
      Math.abs(bandWidth - colSpan(17)),
      2,
      `Band keeps the 17-column cap rather than the -five arm's 21 ` +
        `(width=${bandWidth}, cap=${colSpan(17)}, five=${colSpan(21)})`
    );
    Assert.greaterOrEqual(
      colSpan(17),
      pairWidth(3),
      `The cap still clears the 3-card pair ` +
        `(cap=${colSpan(17)}, needs=${pairWidth(3)})`
    );

    const column = content.document.querySelector(".layout-content-column");
    const columnWidth = column.getBoundingClientRect().width;
    Assert.less(
      Math.abs(columnWidth - colSpan(12)),
      2,
      `Content column stops at 3 cards ` +
        `(width=${columnWidth}, expected=${colSpan(12)}, four=${colSpan(16)})`
    );

    const widgets = content.document.querySelector(
      ".widgets-section-container"
    );
    Assert.less(
      Math.abs(widgets.getBoundingClientRect().width - colSpan(4)),
      2,
      `Widgets column is still one card wide ` +
        `(width=${widgets.getBoundingClientRect().width}, expected=${colSpan(4)})`
    );
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await pushPrefs(...layoutPrefs("side-by-side-widgets-lead"), [
      "browser.newtabpage.activity-stream.widgets.lists.enabled",
      false,
    ]);
  },

  // The raised cap is scoped to .side-by-side-active, so one section on its own
  // stays at 4 cards rather than stretching to 5.
  test: async function test_single_section_stops_at_four_cards() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    // Wide enough that only the cap can be holding the band back. Set here rather
    // than by resizing the window, which cannot reach it on Linux CI.
    content.document.querySelector(".nova-enabled.container").style.inlineSize =
      "1900px";

    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);

    ok(
      !band.classList.contains("side-by-side-active"),
      "Not active with widgets hidden, so the cap is not raised"
    );
    Assert.less(
      Math.abs(band.getBoundingClientRect().width - colSpan(16)),
      2,
      `Band keeps the 16-column cap, so the feed tops out at 4 cards ` +
        `(width=${band.getBoundingClientRect().width}, cap=${colSpan(16)}, ` +
        `five=${colSpan(21)})`
    );
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await resizeChromeWindowTo(1400, 1000);
    // Everything the experiment needs except the variant itself.
    await pushPrefs(...layoutPrefs("nova-full-width"));
  },

  // Guards the non-invasive constraint: outside the experiment the new wrapper
  // must generate no box and paint nothing.
  test: async function test_default_layout_is_untouched() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    Assert.equal(
      band.className,
      "content-full-width",
      "No variant class on the default layout"
    );
    Assert.equal(
      content.window.getComputedStyle(band).marginBlockStart,
      "0px",
      "The band keeps its original spacing outside the experiment"
    );

    const column = content.document.querySelector(".layout-content-column");
    ok(column, "The wrapper still renders, so the DOM is the same everywhere");
    Assert.equal(
      content.window.getComputedStyle(column).display,
      "contents",
      "The wrapper generates no box, so it cannot affect placement"
    );

    for (const [name, el] of [
      ["content", column],
      ["widgets", content.document.querySelector(".widgets-section-container")],
    ]) {
      // A ::before that is never generated still reports a full computed style
      // (border-color defaults to currentColor), so check `content` and the
      // border width rather than colours.
      const panel = content.window.getComputedStyle(el, "::before");
      Assert.equal(
        panel.content,
        "none",
        `${name} section generates no panel pseudo-element`
      );
      Assert.equal(
        panel.borderTopWidth,
        "0px",
        `${name} section paints no panel border outside the experiment`
      );
    }

    Assert.equal(
      content.window.getComputedStyle(
        content.document.querySelector(".widgets-title-container")
      ).marginBlockStart,
      "7.5px",
      "The widgets header keeps its own top margin outside the experiment"
    );
  },
});

test_newtab({
  async before({ pushPrefs }) {
    await pushPrefs(...layoutPrefs("side-by-side-content-lead"));
  },

  // Guards the at-band-cols(12) cap in _Grid.scss: without it the card count goes
  // 2 -> 3 -> 2 as the window widens.
  test: async function test_side_by_side_holds_two_cards_below_pair() {
    const band = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector(".content-full-width"),
      "Wait for the content band to render"
    );

    // 1035px of outer-grid, inside the [1023.75, 1046.25) window where the ladder
    // reaches three cards but the pair does not yet fit. Set here rather than by
    // resizing the window, so the range cannot be missed.
    content.document.querySelector(".nova-enabled.container").style.inlineSize =
      "1080px";

    const span = (cols, gaps) => {
      const probe = content.document.createElement("div");
      probe.style.cssText =
        "position: absolute; visibility: hidden; inline-size: " +
        `calc(${cols} * var(--col-width) + ${gaps} * var(--space-medium));`;
      band.appendChild(probe);
      const { width } = probe.getBoundingClientRect();
      probe.remove();
      return width;
    };
    const colSpan = n => span(n, n - 1);
    const pairWidth = cards => span(4 + 4 * cards, 4 * cards + 5);

    // Fail loudly if the resize overshot, rather than passing by accident.
    const bandWidth = band.getBoundingClientRect().width;
    Assert.greaterOrEqual(
      bandWidth,
      colSpan(12),
      `Band is wide enough that the ladder would reach three cards ` +
        `(band=${bandWidth}, threshold=${colSpan(12)})`
    );
    Assert.less(
      bandWidth,
      pairWidth(2),
      `Band is still too narrow for the pair ` +
        `(band=${bandWidth}, threshold=${pairWidth(2)})`
    );

    const widgets = content.document.querySelector(
      ".widgets-section-container"
    );
    Assert.equal(
      content.window.getComputedStyle(widgets).display,
      "none",
      "Widgets stay hidden below the pair threshold"
    );

    const column = content.document.querySelector(".layout-content-column");
    const columnWidth = column.getBoundingClientRect().width;
    Assert.less(
      Math.abs(columnWidth - colSpan(8)),
      2,
      `Feed holds at two cards rather than stepping to three ` +
        `(width=${columnWidth}, expected=${colSpan(8)}, three=${colSpan(12)})`
    );
  },
});
