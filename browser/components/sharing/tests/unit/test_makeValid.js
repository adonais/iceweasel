/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const BASE_INVALID_LINKS = [
  { title: "Missing URI" },
  {
    title: "Valid link. This will be trimmed".repeat(101),
    uri: "https://example.com?" + "a".repeat(4000),
  },
  {
    title: "A string url. Will fail regex match",
    uri: "invalid-url that will be removed by makeValidLink function",
  },
  {
    title: "About link. Will fail regex match",
    uri: "about:robots",
  },
  {
    title: "Will pass regex but fail URL constructor and be removed",
    uri: "https",
  },
  {
    title: "Will pass regex but fail URL constructor and be removed",
    uri: "https://",
  },
  {
    title: "Unencoded braces pass WHATWG URL but fail schema format: uri",
    uri: "https://example.com/?clickId={ClickId}&img={key}&placement={placement}",
  },
];

const INVALID_TABS_SHARE = {
  title: "tabs".repeat(101),
  type: "tabs",
  children: [
    ...BASE_INVALID_LINKS,
    ...Array.from({ length: 30 }, (_, i) => ({
      title: `Example link ${i}`,
      uri: `https://example.com/${i}`,
    })),
  ],
};

const INVALID_TABGROUP_SHARE = {
  title: "tab_group".repeat(101),
  type: "tab_group",
  children: [
    ...BASE_INVALID_LINKS,
    ...Array.from({ length: 30 }, (_, i) => ({
      title: `Example link ${i}`,
      uri: `https://example.com/${i}`,
    })),
  ],
};

const INVALID_BOOKMARKS_SHARE = {
  title: "bookmarks".repeat(101),
  type: "bookmarks",
  children: [
    ...BASE_INVALID_LINKS,
    {
      type: "bookmarks",
      title: "Nested bookmark folder".repeat(101),
      children: [
        ...BASE_INVALID_LINKS,
        {
          type: "bookmarks",
          title: "Doubly Nested bookmark folder".repeat(101),
          children: [
            ...BASE_INVALID_LINKS,
            ...Array.from({ length: 30 }, (_, i) => ({
              title: `Doubly Nested Example link ${i}`,
              uri: `https://doubly-nested-example.com/${i}`,
            })),
          ],
        },
      ],
    },
    ...Array.from({ length: 30 }, (_, i) => ({
      title: `Example link ${i}`,
      uri: `https://example.com/${i}`,
    })),
  ],
};

const INVALID_BOOKMARKS_SHARE_2 = {
  title: "Many nested bookmarks",
  type: "bookmarks",
  children: [],
};

function makeManyNestedBookmarks(depth) {
  if (depth > 35) {
    return [
      {
        title: `Link at depth ${depth}`,
        uri: `https://example.com/${depth}`,
      },
    ];
  }
  const bookmark = {
    type: "bookmarks",
    title: `Nested bookmark folder at depth ${depth}`,
    children: [makeManyNestedBookmarks(depth + 1)],
  };

  return bookmark;
}

const INVALID_BOOKMARKS_SHARE_3 = {
  title: "Many nested bookmarks",
  type: "bookmarks",
  children: [],
};

function makeManyNestedBookmarksWithLink(depth) {
  if (depth > 35) {
    return [
      {
        title: `Link at depth ${depth}`,
        uri: `https://example.com/${depth}`,
      },
    ];
  }
  const bookmark = {
    type: "bookmarks",
    title: `Nested bookmark folder at depth ${depth}`,
    children: [
      {
        title: `Link at depth ${depth}`,
        uri: `https://example.com/${depth}`,
      },
      makeManyNestedBookmarksWithLink(depth + 1),
    ],
  };

  return bookmark;
}

add_task(async function test_makeValid() {
  INVALID_BOOKMARKS_SHARE_2.children.push(makeManyNestedBookmarks(0));
  INVALID_BOOKMARKS_SHARE_3.children.push(makeManyNestedBookmarksWithLink(0));

  // buildShare drops individual invalid links synchronously, so the per-link
  // validator must be loaded first.
  await ContentSharingUtils.getLinkValidator();

  for (let [invalidShare, shouldPass] of [
    [INVALID_TABS_SHARE, true],
    [INVALID_TABGROUP_SHARE, true],
    [INVALID_BOOKMARKS_SHARE, true],
    [INVALID_BOOKMARKS_SHARE_2, false],
    [INVALID_BOOKMARKS_SHARE_3, true],
  ]) {
    let shareResult = ContentSharingUtils.buildShare(invalidShare);
    shareResult = await ContentSharingUtils.validateSchema(shareResult);

    if (shouldPass) {
      Assert.equal(
        shareResult.error,
        null,
        "There should be no error in the share result"
      );
    } else {
      Assert.equal(
        shareResult.error,
        ERRORS.INVALID_SCHEMA,
        "ERRORS.INVALID_SCHEMA should be set on the share result"
      );
    }
  }
});

add_task(async function test_dropsInvalidLinksKeepsValid() {
  await ContentSharingUtils.getLinkValidator();

  const MIXED_SHARE = {
    title: "Mixed tabs",
    type: "tabs",
    children: [
      { title: "Good", uri: "https://example.com/good" },
      {
        title: "Bad braces",
        uri: "https://lps.plarium.com/?clickId={ClickId}&img={key}",
      },
      { title: "Also good", uri: "https://example.com/also-good" },
    ],
  };

  let shareResult = ContentSharingUtils.buildShare(MIXED_SHARE);
  Assert.equal(
    shareResult.share.links.length,
    2,
    "The link with unencoded braces should be dropped, keeping the two valid links"
  );
  Assert.ok(
    shareResult.share.links.every(link => !link.url.includes("{")),
    "No surviving link should contain unencoded braces"
  );

  shareResult = await ContentSharingUtils.validateSchema(shareResult);
  Assert.equal(
    shareResult.error,
    null,
    "A share with at least one valid link should not error"
  );
});

add_task(async function test_allInvalidLinksErrors() {
  await ContentSharingUtils.getLinkValidator();

  const ALL_INVALID_SHARE = {
    title: "All invalid tabs",
    type: "tabs",
    children: [
      { title: "Braces", uri: "https://example.com/?a={b}" },
      { title: "About", uri: "about:robots" },
    ],
  };

  let shareResult = ContentSharingUtils.buildShare(ALL_INVALID_SHARE);
  Assert.equal(
    shareResult.share.links.length,
    0,
    "All links should be dropped"
  );

  shareResult = await ContentSharingUtils.validateSchema(shareResult);
  Assert.equal(
    shareResult.error,
    ERRORS.INVALID_SCHEMA,
    "A share with no valid links should error with INVALID_SCHEMA"
  );
});
