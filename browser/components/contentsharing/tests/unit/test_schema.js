/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function fetchJson(url) {
  // const response = await fetch(url);
  // return response.json();
  const file = do_get_file(url);
  const data = await IOUtils.readUTF8(file.path);
  return JSON.parse(data);
}

add_task(async function test_validSchemas() {
  const VALID_SHARES = await fetchJson("validContentSharing.0.1.0.json");
  for (const share of VALID_SHARES) {
    Assert.ok(
      await ContentSharingUtils.validateSchema(share.test),
      "The validate function should retrun true for valid shares"
    );
  }
});

add_task(async function test_invalidSchemas() {
  const INVALID_SHARES = await fetchJson("invalidContentSharing.0.1.0.json");
  for (const share of INVALID_SHARES) {
    await Assert.rejects(
      ContentSharingUtils.validateSchema(share.test),
      new RegExp("ContentSharing Schema Error:"),
      "The validate function should throw for invalid shares"
    );
  }
});
