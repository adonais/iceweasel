ChromeUtils.defineESModuleGetters(this, {
  ContentSharingUtils:
    "resource:///modules/contentsharing/ContentSharingUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(this, "ContentSharingMockServer", () => {
  const { ContentSharingMockServer: server } = ChromeUtils.importESModule(
    "resource://testing-common/ContentSharingMockServer.sys.mjs"
  );
  return server;
});

/**
 * Starts the mock content sharing server, runs task, then stops it.
 * The server is stopped in a finally block so cleanup always runs.
 *
 * @param {Function} task - Async function receiving the mock server instance.
 */
async function withContentSharingMockServer(task) {
  await ContentSharingMockServer.start();
  try {
    await task(ContentSharingMockServer);
  } finally {
    await ContentSharingMockServer.stop();
  }
}
