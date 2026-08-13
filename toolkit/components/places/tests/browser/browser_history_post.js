const PAGE_URI =
  "https://example.com/tests/toolkit/components/places/tests/browser/history_post.html";
const SJS_URI = Services.io.newURI(
  "https://example.com/tests/toolkit/components/places/tests/browser/history_post.sjs"
);

add_task(async function () {
  let promiseVisited = PlacesTestUtils.waitForNotification(
    "page-visited",
    events => events.some(e => e.url === SJS_URI.spec)
  );
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URI },
    async function (aBrowser) {
      await SpecialPowers.spawn(aBrowser, [], async function () {
        content.document.getElementById("submit").click();
      });
      await promiseVisited;
      let visited = await PlacesUtils.history.hasVisits(SJS_URI);
      ok(visited, "The POST page should be added to history");
      ok(
        await PlacesTestUtils.isPageInDB(SJS_URI.spec),
        "The page should be in the database"
      );
    }
  );
});
