/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that the get_page_content tool call can extract content from a page.
 */
add_task(async function test_get_page_content_basic() {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Test Page</title>
    </head>
    <body>
      <article>
        <h1>Sample Article Title</h1>
        <p>This is the first paragraph with some sample content.</p>
        <p>This is the second paragraph with additional information.</p>
      </article>
    </body>
    </html>
  `;

  const { url, GetPageContent, cleanup } = await setupGetPageContentTest(html);

  // Manually set the ai-window attribute for testing
  // (in production this is set via window features when opening the window)
  window.document.documentElement.setAttribute("ai-window", "true");

  // Verify we're in an AI Window
  const { AIWindow } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs"
  );
  info("Is AI Window: " + AIWindow.isAIWindowActive(window));
  info(
    "Window has ai-window attribute: " +
      window.document.documentElement.hasAttribute("ai-window")
  );

  // Create an allowed URLs set containing the test page
  const allowedUrls = new Set([url]);

  // Call the tool with the URL
  const result = await GetPageContent.getPageContent({ url }, allowedUrls);

  info("Extraction result: " + result);

  // Verify the result contains expected content
  ok(
    result.includes("Sample Article Title"),
    "Result should contain the title"
  );
  ok(
    result.includes("first paragraph"),
    "Result should contain text from the first paragraph"
  );
  ok(
    result.includes("second paragraph"),
    "Result should contain text from the second paragraph"
  );

  // Verify the result indicates which extraction mode was used
  ok(
    result.startsWith("Content (") && result.includes(") from"),
    "Result should indicate the extraction mode used"
  );

  await cleanup();
});
