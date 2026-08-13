/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that the cached about:home document carries the same
 * Content-Security-Policy as the dynamically-rendered document, so entry
 * points like the Crossword iframe (allowlisted via frame-src) aren't
 * silently blocked on the first load from the startup cache.
 *
 * See bug 2055158: the cache template had drifted out of sync with the
 * render script's CSP.
 */
add_task(async function test_cached_csp_matches_dynamic() {
  await withFullyLoadedAboutHome(async browser => {
    // Read the CSP from the dynamically-rendered about:home first.
    let dynamicCSP = await SpecialPowers.spawn(browser, [], () => {
      return content.document.querySelector(
        "meta[http-equiv='Content-Security-Policy']"
      )?.content;
    });
    Assert.ok(dynamicCSP, "Dynamic about:home has a CSP meta tag.");
    Assert.ok(
      dynamicCSP.includes("frame-src"),
      "Dynamic about:home CSP allowlists frames (frame-src present)."
    );

    await clearCache();
    await simulateRestart(browser);
    await ensureCachedAboutHome(browser);

    let cachedCSP = await SpecialPowers.spawn(browser, [], () => {
      return content.document.querySelector(
        "meta[http-equiv='Content-Security-Policy']"
      )?.content;
    });
    Assert.ok(cachedCSP, "Cached about:home has a CSP meta tag.");
    Assert.equal(
      cachedCSP,
      dynamicCSP,
      "Cached about:home CSP matches the dynamic about:home CSP."
    );
  });
});
