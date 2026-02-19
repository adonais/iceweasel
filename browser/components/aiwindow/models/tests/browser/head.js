/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Start an HTTP server that serves HTML content.
 *
 * @param {string} html - The HTML content to serve
 * @returns {object} An object containing:
 *   - url: The URL where the content is served
 *   - serverClosed: Promise that resolves when the server stops
 */
function serveHTML(html) {
  const { HttpServer } = ChromeUtils.importESModule(
    "resource://testing-common/httpd.sys.mjs"
  );

  const server = new HttpServer();

  server.registerPathHandler("/test-page.html", (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.write(html);
  });

  server.start(-1);

  const { primaryHost, primaryPort } = server.identity;
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  const url = `http://${primaryHost}:${primaryPort}/test-page.html`;

  return {
    url,
    server,
  };
}

/**
 * Set up a test for the get_page_content tool call by serving HTML and loading it.
 *
 * @param {string} html - The HTML content to serve and test
 * @returns {Promise<object>} An object containing:
 *   - tab: The opened browser tab
 *   - url: The URL of the loaded page
 *   - GetPageContent: The GetPageContent class
 *   - cleanup: Function to clean up the test
 */
async function setupGetPageContentTest(html) {
  const { GetPageContent } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
  );

  const { url, server } = serveHTML(html);

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    url,
    true // waitForLoad
  );

  return {
    tab,
    url,
    GetPageContent,
    async cleanup() {
      info("Cleaning up test");
      BrowserTestUtils.removeTab(tab);
      await new Promise(resolve => server.stop(resolve));
    },
  };
}
