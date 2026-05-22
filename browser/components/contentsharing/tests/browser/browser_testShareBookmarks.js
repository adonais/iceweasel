/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function createFolderWithBookmarks(
  folderName,
  parentGuid = PlacesUtils.bookmarks.toolbarGuid
) {
  const folder = await PlacesUtils.bookmarks.insert({
    index: -1,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    parentGuid,
    title: folderName,
  });

  for (let i of [1, 2, 3, 4, 5]) {
    await PlacesUtils.bookmarks.insert({
      index: -1,
      type: PlacesUtils.bookmarks.TYPE_BOOKMARK,
      parentGuid: folder.guid,
      url: `https://example.com/${i}`,
      title: `Example ${i}`,
    });
  }
  return folder;
}

add_setup(function () {
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

add_task(async function test_shareBookmarks() {
  const folder = await createFolderWithBookmarks("test folder");

  const shareResult = await ContentSharingUtils.buildShareFromBookmarkFolders([
    folder.guid,
  ]);
  ok(
    await ContentSharingUtils.validateSchema(shareResult),
    "The result from buildShareFromBookmarkFolders should be valid against the schema"
  );

  await createFolderWithBookmarks("nested folder", folder.guid);

  const nestedShareResult =
    await ContentSharingUtils.buildShareFromBookmarkFolders([folder.guid]);
  ok(
    await ContentSharingUtils.validateSchema(nestedShareResult),
    "The result from buildShareFromBookmarkFolders should be valid against the schema"
  );

  const folder2 = await createFolderWithBookmarks("test folder 2");

  const twoFolderShareResult =
    await ContentSharingUtils.buildShareFromBookmarkFolders([
      folder.guid,
      folder2.guid,
    ]);
  ok(
    await ContentSharingUtils.validateSchema(twoFolderShareResult),
    "The result from buildShareFromBookmarkFolders should be valid against the schema"
  );
});

add_task(async function test_createShareableLink() {
  await withContentSharingMockServer(async server => {
    const folder = await createFolderWithBookmarks("test folder");
    await ContentSharingUtils.createShareableLinkFromBookmarkFolders([
      folder.guid,
    ]);

    Assert.equal(
      server.requests.length,
      1,
      "Server received exactly one request"
    );
    const body = server.requests[0].body;

    await assertContentSharingModal(
      window,
      {
        share: body,
        error: null,
        warning: null,
        url: server.mockResponse.url,
        isSchemaValid: true,
        isSignedIn: true,
      },
      true
    );

    Assert.equal(body.type, "bookmarks", "Share type is 'bookmarks'");
    Assert.equal(body.links.length, 5, "Share contains 5 links");

    for (let i of [1, 2, 3, 4, 5]) {
      Assert.equal(
        body.links[i - 1].url,
        `https://example.com/${i}`,
        `Link ${i} URL matches the expected value`
      );
    }

    await PlacesUtils.bookmarks.eraseEverything();
  });
});
