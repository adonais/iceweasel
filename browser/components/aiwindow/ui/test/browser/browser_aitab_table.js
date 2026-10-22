/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_aitab_table_page.html";

const COLUMNS = [
  { key: "name", label: "Name", type: "text", role: "title" },
  {
    key: "price",
    label: "Price",
    type: "currency",
    currency: "USD",
    suffix: " / night",
  },
  { key: "rating", label: "Rating", type: "rating", max: 5 },
  { key: "reviews", type: "number" },
];

const ROWS = [
  {
    name: "Nijima Escape",
    price: 109,
    rating: 3.9,
    reviews: 520,
    href: "https://www.example.com/nijima",
  },
  { name: "Yado Marubun", price: 215.5, rating: 4.9, reviews: 3124 },
];

async function openTestPage() {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    await content.customElements.whenDefined("aitab-table");
  });
  return { tab, browser: tab.linkedBrowser };
}

async function withTestPage(fn) {
  const { tab, browser } = await openTestPage();
  try {
    await fn(browser);
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
}

/**
 * Sets properties on the table and waits for it to re-render and for its
 * Fluent strings to be filled in.
 *
 * @param {Browser} browser
 * @param {object} props - Properties to assign to the table.
 */
async function setTableProps(browser, props) {
  await SpecialPowers.spawn(browser, [props], async properties => {
    const table = content.document.getElementById("table");
    Object.assign(table, properties);
    await table.updateComplete;
    await content.document.l10n.translateRoots();
  });
}

/**
 * Reads the rendered text of the header cells and of every body row.
 *
 * @param {Browser} browser
 * @returns {Promise<{headers: string[], rows: string[][]}>}
 */
function readCells(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    const shadow = content.document.getElementById("table").shadowRoot;
    const text = cell => cell.textContent.trim();
    return {
      headers: [...shadow.querySelectorAll("thead th")].map(text),
      rows: [...shadow.querySelectorAll("tbody tr")].map(row =>
        [...row.querySelectorAll("th, td")].map(text)
      ),
    };
  });
}

add_task(async function test_renders_heading_columns_and_rows() {
  await withTestPage(async browser => {
    await setTableProps(browser, {
      heading: "Where to stay",
      description: "Two options gathered from your open tabs",
      columns: COLUMNS,
      rows: ROWS,
    });

    await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      const heading = shadow.querySelector("h2");
      Assert.equal(heading.textContent.trim(), "Where to stay", "Heading text");
      Assert.equal(
        shadow.querySelector(".aitab-table-description").textContent,
        "Two options gathered from your open tabs",
        "Description text"
      );
      const table = shadow.querySelector("table");
      Assert.equal(
        table.getAttribute("aria-labelledby"),
        heading.id,
        "The table is named by its heading"
      );
      Assert.equal(
        table.dataset.details,
        "3",
        "Three detail columns follow the name column"
      );
      Assert.ok(
        [...shadow.querySelectorAll("thead th")].every(th => th.scope == "col"),
        "Header cells are column headers"
      );
      Assert.ok(
        [...shadow.querySelectorAll("tbody th")].every(th => th.scope == "row"),
        "Name cells are row headers"
      );
    });

    const { headers, rows } = await readCells(browser);
    Assert.deepEqual(
      headers,
      ["Name", "Price", "Rating", "reviews"],
      "Column labels render, falling back to the key"
    );
    Assert.equal(rows.length, 2, "One body row per item");
  });
});

add_task(async function test_formats_values_per_column_type() {
  await withTestPage(async browser => {
    await setTableProps(browser, {
      columns: [
        ...COLUMNS,
        { key: "distance", type: "number", prefix: "~", suffix: " km" },
        { key: "checkin", type: "date" },
        { key: "released", type: "date" },
        { key: "missing", type: "text" },
        { key: "mystery", type: "hologram" },
        { key: "fee", type: "currency", currency: "DOLLARS" },
      ],
      rows: [
        {
          ...ROWS[0],
          distance: 1234.5,
          checkin: "2026-10-01T12:00:00Z",
          released: "2025-08-12",
          mystery: "as is",
          fee: 12,
        },
        // Values the model wrote out as text, in another locale's notation.
        {
          ...ROWS[1],
          rating: "4,5",
          distance: "1.234",
          checkin: "12/08/2025",
          released: "",
          missing: null,
        },
      ],
    });

    const { rows } = await readCells(browser);
    const [
      price,
      rating,
      reviews,
      distance,
      checkin,
      released,
      missing,
      mystery,
      fee,
    ] = rows[0].slice(1);

    // Intl output depends on the locale of the machine running the test, so
    // the assertions check the parts a locale cannot move rather than a string.
    const currencySymbol = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    })
      .formatToParts(1)
      .find(part => part.type == "currency").value;
    Assert.ok(
      price.includes(currencySymbol) &&
        price.includes("109") &&
        price.endsWith(" / night"),
      `Currency shows the symbol, the whole amount and the suffix: ${price}`
    );
    Assert.ok(
      !/109[.,]00/.test(price),
      "A whole amount does not show trailing zeros"
    );
    Assert.equal(
      rating,
      `${(3.9).toLocaleString()} / ${(5).toLocaleString()}`,
      "Rating is a localized value out of the column's max"
    );
    Assert.ok(
      reviews.includes("520") && !reviews.includes("."),
      `A number is localized: ${reviews}`
    );
    Assert.ok(
      distance.startsWith("~") &&
        distance.includes("234") &&
        distance.endsWith(" km"),
      `Prefix and suffix wrap the number: ${distance}`
    );
    Assert.ok(
      checkin.includes("2026") && !/\d:\d\d/.test(checkin),
      `A timestamp renders as a date without a time: ${checkin}`
    );
    Assert.ok(
      released.includes("12") && released.includes("2025"),
      `A bare date keeps its day whatever the local time zone: ${released}`
    );
    Assert.equal(missing, "", "A missing value renders an empty cell");
    Assert.equal(mystery, "as is", "An unknown type passes the value through");
    Assert.equal(
      fee,
      (12).toLocaleString(),
      "A currency code Intl does not know falls back to a plain number"
    );

    Assert.ok(
      rows[1][1].includes("215") && /215[.,]50?\b/.test(rows[1][1]),
      `Fractional currency keeps its cents: ${rows[1][1]}`
    );
    Assert.equal(rows[1][2], "4,5", "A rating written as text is untouched");
    Assert.deepEqual(
      rows[1].slice(4, 8),
      ["~1.234 km", "12/08/2025", "", ""],
      "Numbers and dates written as text pass through and empty ones stay empty"
    );
  });
});

add_task(async function test_source_chip() {
  await withTestPage(async browser => {
    await setTableProps(browser, {
      columns: COLUMNS,
      rows: [
        ...ROWS,
        { name: "Route", href: "app://views/relayout" },
        { name: "Odd", href: 42 },
        null,
      ],
    });

    const chips = await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      return [...shadow.querySelectorAll("tbody tr")].map(row => {
        const chip = row.querySelector("ai-website-chip");
        return (
          chip && { label: chip.label, href: chip.href, icon: chip.iconSrc }
        );
      });
    });
    Assert.equal(chips.length, 5, "Every row renders, even a null one");
    Assert.deepEqual(
      chips[0],
      {
        label: "www.example.com",
        href: "https://www.example.com/nijima",
        icon: "page-icon:https://www.example.com/nijima",
      },
      "An http(s) href becomes a source chip labelled with the host"
    );
    Assert.deepEqual(
      chips.slice(1),
      [null, null, null, null],
      "No chip without an http(s) href"
    );

    const detail = await SpecialPowers.spawn(browser, [], async () => {
      const opened = new Promise(resolve => {
        content.document.addEventListener(
          "AITab:OpenLink",
          event => resolve(event.detail),
          { once: true }
        );
      });
      const chip = content.document
        .getElementById("table")
        .shadowRoot.querySelector("ai-website-chip");
      chip.shadowRoot.querySelector("a").click();
      return opened;
    });
    Assert.equal(
      detail.url,
      "https://www.example.com/nijima",
      "Clicking the chip asks the page's actor to open the link"
    );
  });
});

add_task(async function test_title_and_subtitle_roles() {
  await withTestPage(async browser => {
    await setTableProps(browser, {
      columns: [
        { key: "name", type: "text" },
        { key: "area", type: "text", role: "subtitle" },
        { key: "price", label: "Price", type: "currency" },
      ],
      rows: [
        { name: "Yado Marubun", area: "Nagamachi", price: 215 },
        { name: "Nijima Escape", price: 109 },
      ],
    });

    const { headers, rows } = await readCells(browser);
    Assert.deepEqual(
      headers,
      ["name", "Price"],
      "The first column stands in as the title; the subtitle is not a column"
    );
    Assert.equal(rows[0].length, 2, "Subtitle renders inside the name cell");

    const subtitles = await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      return [...shadow.querySelectorAll("tbody tr")].map(row =>
        [...row.querySelectorAll(".aitab-table-subtitle")].map(
          el => el.textContent
        )
      );
    });
    Assert.deepEqual(
      subtitles,
      [["Nagamachi"], []],
      "A subtitle renders under the name only when the row has a value"
    );

    await setTableProps(browser, {
      columns: [
        { key: "area", type: "text", role: "subtitle" },
        { key: "name", type: "text" },
      ],
      rows: [{ name: "Yado Marubun", area: "Nagamachi" }],
    });
    const subtitleFirst = await readCells(browser);
    Assert.deepEqual(
      subtitleFirst.headers,
      ["name"],
      "A leading subtitle column does not stand in as the title"
    );
    const nameCell = await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      return {
        name: shadow.querySelector(".aitab-table-name").textContent,
        subtitles: [...shadow.querySelectorAll(".aitab-table-subtitle")].map(
          el => el.textContent
        ),
      };
    });
    Assert.deepEqual(
      nameCell,
      { name: "Yado Marubun", subtitles: ["Nagamachi"] },
      "The subtitle renders once, under the name"
    );

    await setTableProps(browser, {
      columns: [{ key: "area", type: "text", role: "subtitle" }],
      rows: [{ area: "Nagamachi" }],
    });
    await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      Assert.equal(
        shadow.querySelector("table"),
        null,
        "Nothing renders when every column is a subtitle"
      );
    });

    await setTableProps(browser, {
      columns: [
        { key: "price", label: "Price", type: "currency" },
        { key: "name", label: "", type: "text", role: "title" },
        { key: "alias", label: "Alias", type: "text", role: "title" },
      ],
      rows: [{ name: "Yado Marubun", alias: "Marubun", price: 215 }],
    });

    const declared = await readCells(browser);
    Assert.deepEqual(
      declared.headers,
      ["name", "Price", "Alias"],
      "The first title column leads with its key standing in for an empty label; a second title column is a detail"
    );
    Assert.equal(
      declared.rows[0][0],
      "Yado Marubun",
      "The title value leads the row"
    );
    Assert.equal(
      declared.rows[0][2],
      "Marubun",
      "The second title renders as a detail"
    );
  });
});

add_task(async function test_without_heading_columns_or_rows() {
  await withTestPage(async browser => {
    await setTableProps(browser, { columns: COLUMNS, rows: [] });

    await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      Assert.equal(shadow.querySelector("h2"), null, "No heading element");
      Assert.equal(
        shadow.querySelector(".aitab-table-description"),
        null,
        "No description element"
      );
      Assert.ok(
        !shadow.querySelector("table").hasAttribute("aria-labelledby"),
        "No dangling aria-labelledby without a heading"
      );
      Assert.equal(
        shadow.querySelectorAll("thead th").length,
        4,
        "The header row renders without any rows"
      );
      Assert.equal(
        shadow.querySelector("tbody").children.length,
        0,
        "No body rows"
      );
    });

    await setTableProps(browser, { columns: [], rows: ROWS });
    await SpecialPowers.spawn(browser, [], () => {
      const shadow = content.document.getElementById("table").shadowRoot;
      Assert.equal(
        shadow.querySelector("table"),
        null,
        "Nothing renders without columns"
      );
    });
  });
});
