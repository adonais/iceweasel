/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Verifies that in about:support's Codec Support table, a codec that lacks its
// Microsoft Store extension links to that codec's own Store page (Windows-only,
// since the extensions only exist on Windows).

const { Troubleshoot } = ChromeUtils.importESModule(
  "resource://gre/modules/Troubleshoot.sys.mjs"
);

// Microsoft Store product IDs each codec's "Install extension" link must point
// at when hardware support is missing because the extension isn't installed.
const EXPECTED_STORE_IDS = {
  AV1: "9MVZQVXJBQ9V",
  HEVC: "9NMZLZ57R3T7",
};

add_task(async function test_lack_of_extension_links() {
  info(
    "Build a codec support string marking each codec as lacking its extension"
  );
  const codecSupportInfo = Object.keys(EXPECTED_STORE_IDS)
    .map(name => `${name} SWDEC LACK_OF_EXTENSION`)
    .join("\n");

  info(
    "Stub Troubleshoot.snapshot so about:support renders the fake codec data"
  );
  const original = Troubleshoot.snapshot;
  Troubleshoot.snapshot = async () => {
    const snapshot = await original.call(Troubleshoot);
    snapshot.media = { ...snapshot.media, codecSupportInfo };
    return snapshot;
  };
  registerCleanupFunction(() => {
    Troubleshoot.snapshot = original;
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: "about:support" },
    async browser => {
      info(
        "Collect the install-extension link of each codec row from the table"
      );
      const links = await SpecialPowers.spawn(browser, [], async () => {
        await ContentTaskUtils.waitForCondition(
          () => content.document.getElementById("codec-table"),
          "codec support table is rendered"
        );
        const result = {};
        const rows = content.document.querySelectorAll("#codec-table tbody tr");
        for (const row of rows) {
          const anchor = row.querySelector("td.lack-of-extension a");
          if (anchor) {
            result[row.cells[0].textContent] = anchor.getAttribute("href");
          }
        }
        return result;
      });

      info("Each codec must link to its own Microsoft Store extension");
      for (const [codec, productId] of Object.entries(EXPECTED_STORE_IDS)) {
        ok(links[codec], `${codec} row shows an install-extension link`);
        ok(
          links[codec]?.includes(productId),
          `${codec} link points at its own Store extension (${productId}), got: ${links[codec]}`
        );
      }
    }
  );
});
