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

  const shareObject = await ContentSharingUtils.buildShareFromBookmarkFolders([
    folder.guid,
  ]);
  ok(
    await ContentSharingUtils.validateSchema(shareObject),
    "The result from buildShareFromBookmarkFolders should be valid against the schema"
  );

  await createFolderWithBookmarks("nested folder", folder.guid);

  const nestedShareObject =
    await ContentSharingUtils.buildShareFromBookmarkFolders([folder.guid]);
  ok(
    await ContentSharingUtils.validateSchema(nestedShareObject),
    "The result from buildShareFromBookmarkFolders should be valid against the schema"
  );

  const folder2 = await createFolderWithBookmarks("test folder 2");

  const twoFolderShareObject =
    await ContentSharingUtils.buildShareFromBookmarkFolders([
      folder.guid,
      folder2.guid,
    ]);
  ok(
    await ContentSharingUtils.validateSchema(twoFolderShareObject),
    "The result from buildShareFromBookmarkFolders should be valid against the schema"
  );
});

add_task(async function test_createShareableLink() {
  await withContentSharingMockServer(async server => {
    const folder = await createFolderWithBookmarks("test folder");
    const shareObject = await ContentSharingUtils.buildShareFromBookmarkFolders(
      [folder.guid]
    );

    const url = await ContentSharingUtils.createShareableLink(shareObject);

    Assert.equal(
      url,
      server.mockResponse.url,
      "createShareableLink should return the URL from the server response"
    );
    Assert.equal(
      server.requests.length,
      1,
      "Server should have received exactly one request"
    );
    Assert.deepEqual(
      server.requests[0].body,
      shareObject,
      "Request body should match the share object"
    );

    await PlacesUtils.bookmarks.eraseEverything();
  });
});
