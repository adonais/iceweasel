/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test PageAssist actors functionality
 */

const TEST_PAGE_URL = getRootDirectory(gTestPath) + "data/readableEn.html";
const TEST_HTML_PAGE = `
  <!DOCTYPE html>
  <html>
    <head><title>Simple Test Page</title></head>
    <body>
      <p>This is a simple paragraph.</p>
    </body>
  </html>
`;
const NON_READABLE_HTML = `
    <!DOCTYPE html>
    <html>
      <head><title>Nonreadbel Page</title></head>
      <body>empty</body>
    </html>
  `;

/**
 * Helpers
 */
function getPageAssistParentActor(browser) {
  return browser.browsingContext.currentWindowGlobal.getActor("PageAssist");
}

function assertCommonPageData(pageData) {
  Assert.ok(pageData, "Page data should be returned");
  Assert.ok(pageData.title, "Page should have a title");
  Assert.ok(pageData.textContent, "Page should have text content");
  Assert.equal(
    typeof pageData.isReaderable,
    "boolean",
    "isReaderable should be a boolean"
  );
}

/**
 * Open the Page Assist sidebar and return the page-assist element util
 *
 * @returns {Promise<HTMLElement>} page-assist element
 */
async function openPageAssistSidebar() {
  await SidebarController.show("viewGenaiPageAssistSidebar");
  const sideBarEl = SidebarController.browser.contentWindow.document;
  const pageAssistEl = sideBarEl.querySelector("page-assist");
  Assert.ok(pageAssistEl, "Page assist element should exist");

  await BrowserTestUtils.waitForCondition(
    () => pageAssistEl.shadowRoot,
    "Shadow root should exist"
  );
  return pageAssistEl;
}

/**
 * Test that PageAssistChild can fetch page data correctly
 */
add_task(async function test_page_assist_child_fetch_data() {
  await BrowserTestUtils.withNewTab(TEST_PAGE_URL, async browser => {
    const parentActor = getPageAssistParentActor(browser);
    const pageData = await parentActor.fetchPageData();

    Assert.ok(pageData, "Page data should be returned");
    Assert.equal(
      pageData.url,
      TEST_PAGE_URL,
      "Page URL should match test page"
    );
    assertCommonPageData(pageData);

    if (pageData.isReaderable) {
      Assert.ok(pageData.content, "Readable page should have content");
      Assert.ok(pageData.excerpt, "Readable page should have excerpt");
    }
  });
});

/**
 * Test PageAssist integration with sidebar
 */
add_task(async function test_page_assist_sidebar_integration() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageAssist.enabled", true]],
  });

  await BrowserTestUtils.withNewTab(TEST_PAGE_URL, async () => {
    // Get elements
    const sidebarEl = await openPageAssistSidebar();
    const shadowRoot = sidebarEl.shadowRoot;
    const textarea = shadowRoot.querySelector(".prompt-textarea");
    const submitBtn = shadowRoot.querySelector("#submit-user-prompt-btn");

    Assert.ok(textarea, "Prompt textarea should exist");
    Assert.ok(submitBtn, "Submit user prompt button should exist");

    const testPrompt = "Test prompt for AI";
    textarea.value = testPrompt;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    Assert.equal(
      sidebarEl.userPrompt,
      testPrompt,
      "User prompt should be updated"
    );

    const { PageAssist } = ChromeUtils.importESModule(
      "moz-src:///browser/components/genai/PageAssist.sys.mjs"
    );
    const originalFetch = PageAssist.fetchAiResponse;
    const mockResponse = "Mock AI response for testing";

    PageAssist.fetchAiResponse = async (_prompt, pageData) => {
      Assert.ok(pageData, "PageData should be passed to fetchAiResponse");
      return mockResponse;
    };

    submitBtn.click();

    // Wait for response to be displayed
    await BrowserTestUtils.waitForCondition(
      () => shadowRoot.querySelector(".ai-response"),
      "AI response should be displayed"
    );

    const response = shadowRoot.querySelector(".ai-response");
    Assert.equal(
      response.textContent,
      mockResponse,
      "Response should match mock response"
    );

    PageAssist.fetchAiResponse = originalFetch;

    SidebarController.hide();
  });

  await SpecialPowers.popPrefEnv();
});

/**
 * Test PageAssist actor message handling
 */
add_task(async function test_page_assist_actor_messages() {
  const dataUrl = "data:text/html," + encodeURIComponent(TEST_HTML_PAGE);

  await BrowserTestUtils.withNewTab(dataUrl, async browser => {
    const parentActor = getPageAssistParentActor(browser);
    const pageData = await parentActor.fetchPageData();

    Assert.ok(pageData, "Should receive page data");
  });
});

/**
 * Test PageAssist with non-readable page
 */
add_task(async function test_page_assist_non_readable_page() {
  const dataUrl = "data:text/html," + encodeURIComponent(NON_READABLE_HTML);

  await BrowserTestUtils.withNewTab(dataUrl, async browser => {
    const parentActor = getPageAssistParentActor(browser);
    const pageData = await parentActor.fetchPageData();

    Assert.ok(pageData, "Page data should be returned");
    // Non-readable expectations based on actor implementation
    Assert.equal(pageData.isReaderable, false, "Should not be readerable");
    Assert.equal(
      pageData.content,
      "",
      "Non-readable page should have empty content"
    );
    Assert.equal(
      pageData.excerpt,
      "",
      "Non-readable page should have empty excerpt"
    );
  });
});

/**
 * Test that page-assist component fetches page data directly
 */
add_task(async function test_page_assist_component_fetch_data() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.pageAssist.enabled", true]],
  });

  await BrowserTestUtils.withNewTab(TEST_PAGE_URL, async () => {
    const sideBarEl = await openPageAssistSidebar();
    const pageData = await sideBarEl._fetchPageData();

    Assert.ok(pageData, "Page data should be fetched");
    Assert.equal(pageData.url, TEST_PAGE_URL, "URL should match test page");
    Assert.ok(pageData.title, "Should have title");
    Assert.ok(pageData.textContent, "Should have text content");

    const originalFetch = sideBarEl._fetchPageData;

    // Test handling when no page data is returned
    sideBarEl._fetchPageData = async () => null;

    await sideBarEl.handleSubmit();

    await BrowserTestUtils.waitForCondition(
      () => sideBarEl.aiResponse === "No page data",
      "Should show 'No page data' when fetch fails"
    );

    Assert.equal(
      sideBarEl.aiResponse,
      "No page data",
      "Should handle missing page data"
    );
    sideBarEl._fetchPageData = originalFetch;
    SidebarController.hide();
  });

  await SpecialPowers.popPrefEnv();
});
