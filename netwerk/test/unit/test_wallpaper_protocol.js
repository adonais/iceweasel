"use strict";

// Need profile so that the protocol handler can resolve the path to the underlying file
do_get_profile();

// A saved wallpaper name, as New Tab writes them.
const SAVED = "v1-custom-dark-center-1-550e8400-e29b-41d4-a716-446655440000";

function imageLoadInfo() {
  // Create a dummy loadinfo which we can hand to newChannel
  let dummyURI = Services.io.newURI("https://www.example.com/");
  let dummyChannel = NetUtil.newChannel({
    uri: dummyURI,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
  });
  return dummyChannel.loadInfo;
}

add_task(function test_interfaces_and_hosts() {
  // Check the protocol handler implements the correct interfaces
  let handler = Services.io.getProtocolHandler("moz-newtab-wallpaper");
  ok(
    handler instanceof Ci.nsIProtocolHandler,
    "moz-newtab-wallpaper handler provides nsIProtocolHandler interface"
  );
  ok(
    handler instanceof Ci.nsISubstitutingProtocolHandler,
    "moz-newtab-wallpaper handler provides nsISubstitutingProtocolHandler interface"
  );

  let dummyLoadInfo = imageLoadInfo();

  // Test that empty host fails
  let emptyHost = Services.io.newURI("moz-newtab-wallpaper://");
  Assert.throws(
    () => handler.newChannel(emptyHost, dummyLoadInfo),
    /NS_ERROR/i,
    "moz-newtab-wallpaper URI with empty host must not resolve"
  );

  // Test that valid host creates a channel (even if file doesn't exist yet)
  let validURI = Services.io.newURI("moz-newtab-wallpaper://wallpaper.jpg");
  let channel = handler.newChannel(validURI, dummyLoadInfo);
  ok(channel, "moz-newtab-wallpaper URI with valid host creates a channel");

  // A host on its own names a file at the top level, as it always has.
  Assert.stringContains(
    handler.resolveURI(validURI),
    "/wallpaper/wallpaper.jpg",
    "host on its own resolves into the wallpaper folder"
  );
});

add_task(function test_path_resolution() {
  let handler = Services.io.getProtocolHandler("moz-newtab-wallpaper");

  // A path names a file inside a folder, at any depth. An encoded slash
  // arrives decoded, so it splits components.
  for (let [spec, expected] of [
    [`moz-newtab-wallpaper://library/${SAVED}`, `/wallpaper/library/${SAVED}`],
    [
      "moz-newtab-wallpaper://library/deeper/still",
      "/wallpaper/library/deeper/still",
    ],
    ["moz-newtab-wallpaper://library/sub%2fdir", "/wallpaper/library/sub/dir"],
  ]) {
    Assert.stringContains(
      handler.resolveURI(Services.io.newURI(spec)),
      expected,
      `resolves into the folder it names: ${spec}`
    );
  }

  // URI parsing collapses dot segments before the handler is asked, so these
  // land inside the folder rather than being refused.
  for (let spec of [
    "moz-newtab-wallpaper://library/%2e%2e/prefs.js",
    "moz-newtab-wallpaper://library/%2e%2e%2fprefs.js",
    "moz-newtab-wallpaper://library/%2e",
    "moz-newtab-wallpaper://library/../../prefs.js",
  ]) {
    let resolved = handler.resolveURI(Services.io.newURI(spec));
    Assert.stringContains(
      resolved,
      "/wallpaper/library",
      `stays inside the wallpaper folder: ${spec}`
    );
    ok(!resolved.includes(".."), `no dot segment survives: ${spec}`);
  }

  // An empty component, or a backslash or null inside one, must not resolve.
  for (let spec of [
    "moz-newtab-wallpaper://library/sub%5cdir",
    `moz-newtab-wallpaper://library/${SAVED}%00.txt`,
    `moz-newtab-wallpaper://library/${SAVED}/`,
    "moz-newtab-wallpaper://library//prefs.js",
  ]) {
    Assert.throws(
      () => handler.resolveURI(Services.io.newURI(spec)),
      /NS_ERROR/i,
      `must not resolve: ${spec}`
    );
  }
});

add_task(async function test_nested_load() {
  let libraryDir = PathUtils.join(PathUtils.profileDir, "wallpaper", "library");
  await IOUtils.makeDirectory(libraryDir, { createAncestors: true });

  let bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4]);
  await IOUtils.write(PathUtils.join(libraryDir, SAVED), bytes);

  let channel = NetUtil.newChannel({
    uri: `moz-newtab-wallpaper://library/${SAVED}`,
    loadUsingSystemPrincipal: true,
    contentPolicyType: Ci.nsIContentPolicy.TYPE_IMAGE,
  });

  let stream = channel.open();
  let read = NetUtil.readInputStreamToString(stream, stream.available());
  Assert.equal(
    read,
    String.fromCharCode(...bytes),
    "a file inside the library folder is served byte for byte"
  );
});

add_task(function test_no_traversal() {
  let handler = Services.io.getProtocolHandler("moz-newtab-wallpaper");

  // The host is a component too, and parsing lets these through.
  for (let spec of [
    "moz-newtab-wallpaper://../../../etc/passwd",
    "moz-newtab-wallpaper://%2e%2e/etc/passwd",
    "moz-newtab-wallpaper://./etc/passwd",
  ]) {
    Assert.throws(
      () => handler.resolveURI(Services.io.newURI(spec)),
      /NS_ERROR/i,
      `a dot segment host must not resolve: ${spec}`
    );
  }
});
