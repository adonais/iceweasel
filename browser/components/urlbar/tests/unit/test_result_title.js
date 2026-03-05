/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function places() {
  const TEST_DATA = [
    {
      url: "https://example.com/",
      title: "Example",
      expected: "Example",
    },
    {
      url: "https://example.com/",
      title: undefined,
      expected: "example.com",
    },
    {
      url: "data:text/html,<h1>example</h1>",
      title: undefined,
      expected: "data:text/html,<h1>example</h1>",
    },
  ];

  for (let { url, title, expected } of TEST_DATA) {
    await PlacesUtils.bookmarks.insert({
      url,
      title,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    });

    let context = createContext("example", {
      providers: ["UrlbarProviderPlaces"],
      isPrivate: false,
    });
    await check_results({
      context,
      matches: [
        makeBookmarkResult(context, {
          uri: url,
          title: expected,
        }),
      ],
    });

    await PlacesUtils.bookmarks.eraseEverything();
  }
});

add_task(async function inputHistory() {
  const TEST_DATA = [
    {
      url: "https://example.com/",
      title: "Example",
      expected: "Example",
    },
    {
      url: "https://example.com/",
      title: undefined,
      expected: "example.com",
    },
  ];

  for (let { url, title, expected } of TEST_DATA) {
    let history = {
      url,
      title,
      visits: [{ date: new Date() }],
    };
    await PlacesUtils.history.insertMany([history]);
    await UrlbarUtils.addToInputHistory(url, "inputhistory");

    let context = createContext("inputhistory", {
      providers: ["UrlbarProviderInputHistory"],
      isPrivate: false,
    });
    await check_results({
      context,
      matches: [
        makeVisitResult(context, {
          uri: url,
          title: expected,
        }),
      ],
    });

    await PlacesUtils.history.clear();
    await PlacesTestUtils.clearInputHistory();
  }
});
