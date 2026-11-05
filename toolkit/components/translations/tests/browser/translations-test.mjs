/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// eslint-disable-next-line no-unused-vars
let ok;
let is;
// eslint-disable-next-line no-unused-vars
let isnot;
let ContentTaskUtils;

/** @type {{ document: Document, window: Window }} */
let content;

/**
 * Inject the global variables from the test scope into the ES module scope.
 */
export function setup(config) {
  // When a function is provided to `ContentTask.spawn`, that function is provided the
  // Assert library through variable capture. In this case, this code is an ESM module,
  // and does not have access to that scope. To work around this issue, pass any any
  // relevant variables to that can be bound to the module scope.
  //
  // See: https://searchfox.org/mozilla-central/rev/cdddec7fd690700efa4d6b48532cf70155e0386b/testing/mochitest/BrowserTestUtils/content/content-task.js#78
  const { Assert } = config;
  ok = Assert.ok.bind(Assert);
  is = Assert.equal.bind(Assert);
  isnot = Assert.notEqual.bind(Assert);

  ContentTaskUtils = config.ContentTaskUtils;
  content = config.content;
}

export function getSelectors() {
  return {
    /**
     * Returns the first h1 heading in the document.
     *
     * @returns {HTMLHeadingElement | null}
     */
    getH1() {
      return content.document.querySelector("h1");
    },
    /**
     * Returns the first h1 heading's title attribute.
     *
     * @returns {string | null | undefined}
     */
    getH1Title() {
      return content.document.querySelector("h1")?.getAttribute("title");
    },
    /**
     * Returns the first h1 heading's aria-label attribute.
     *
     * @returns {string | null | undefined}
     */
    getH1AriaLabel() {
      return content.document.querySelector("h1")?.getAttribute("aria-label");
    },
    /**
     * Returns the first PDF page's text span once the text layer is ready.
     *
     * @returns {Promise<HTMLSpanElement | null>}
     */
    getPdfSpan() {
      return waitForCondition(
        () =>
          !!content.document.querySelector(
            `.page[data-page-number='1'] .textLayer .endOfContent`
          ),
        "The text layer must be displayed"
      ).then(() =>
        content.document.querySelector(
          ".page[data-page-number='1'] .textLayer span"
        )
      );
    },
    /**
     * Returns the first header in the document.
     *
     * @returns {HTMLElement | null}
     */
    getHeader() {
      return content.document.querySelector("header");
    },
    /**
     * Returns the final paragraph in document order.
     *
     * @returns {HTMLParagraphElement | null}
     */
    getFinalParagraph() {
      const paragraphs = content.document.querySelectorAll("p");

      return paragraphs.item(paragraphs.length - 1);
    },
    /**
     * Returns the document's final paragraph's title attribute.
     *
     * @returns {string | null | undefined}
     */
    getFinalParagraphTitle() {
      return getSelectors().getFinalParagraph()?.getAttribute("title");
    },
    /**
     * Returns the document's final paragraph's aria-label attribute.
     *
     * @returns {string | null | undefined}
     */
    getFinalParagraphAriaLabel() {
      return getSelectors().getFinalParagraph()?.getAttribute("aria-label");
    },
    /**
     * Returns the first paragraph that is last of its type among its siblings.
     *
     * @returns {HTMLParagraphElement | null}
     */
    getLastOfTypeParagraph() {
      return content.document.querySelector("p:last-of-type");
    },
    /**
     * Returns the French section on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getFrenchSection() {
      return content.document.getElementById("french-section");
    },
    /**
     * Returns the English section on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getEnglishSection() {
      return content.document.getElementById("english-section");
    },
    /**
     * Returns the Spanish section on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getSpanishSection() {
      return content.document.getElementById("spanish-section");
    },
    /**
     * Returns the designated French sentence on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getFrenchSentence() {
      return content.document.getElementById("french-sentence");
    },
    /**
     * Returns the designated English sentence on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getEnglishSentence() {
      return content.document.getElementById("english-sentence");
    },
    /**
     * Returns the designated Spanish sentence on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getSpanishSentence() {
      return content.document.getElementById("spanish-sentence");
    },
    /**
     * Returns the English hyperlink on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getEnglishHyperlink() {
      return content.document.getElementById("english-hyperlink");
    },
    /**
     * Returns the French hyperlink on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getFrenchHyperlink() {
      return content.document.getElementById("french-hyperlink");
    },
    /**
     * Returns the Spanish hyperlink on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getSpanishHyperlink() {
      return content.document.getElementById("spanish-hyperlink");
    },
    /**
     * Returns the hyperlink with URL text on the Select Translations test page.
     *
     * @returns {HTMLElement | null}
     */
    getURLHyperlink() {
      return content.document.getElementById("url-hyperlink");
    },
    /**
     * Returns the whitespace sample on the Translations text-cleaning test page.
     *
     * @returns {HTMLElement | null}
     */
    getTextCleaningWhitespace() {
      return content.document.getElementById("clean-whitespace");
    },
    /**
     * Returns the soft-hyphen sample on the Translations text-cleaning test page.
     *
     * @returns {HTMLElement | null}
     */
    getTextCleaningSoftHyphens() {
      return content.document.getElementById("clean-soft-hyphens");
    },
  };
}

/**
 * Provide longer defaults for the waitForCondition.
 *
 * @param {Function} callback
 * @param {string} message
 */
export function waitForCondition(callback, message) {
  const interval = 100;
  // Use 4 times the defaults to guard against intermittents. Many of the tests rely on
  // communication between the parent and child process, which is inherently async.
  const maxTries = 50 * 4;
  return ContentTaskUtils.waitForCondition(
    callback,
    message,
    interval,
    maxTries
  );
}

/**
 * Collects the translated documents for the current page and any translated descendant frames.
 *
 * @param {WindowGlobalChild} [windowGlobalChild=content.windowGlobalChild]
 * @returns {TranslationsDocument[]}
 */
export function collectTranslatedDocs(
  windowGlobalChild = content.windowGlobalChild
) {
  const translatedDocs = [];

  const translationsChild = windowGlobalChild.getExistingActor("Translations");
  if (translationsChild?.translatedDoc) {
    translatedDocs.push(translationsChild.translatedDoc);
  }

  for (const childBrowsingContext of windowGlobalChild.browsingContext
    .children) {
    const childWindowGlobal = childBrowsingContext.currentWindowGlobal;
    if (childWindowGlobal) {
      translatedDocs.push(...collectTranslatedDocs(childWindowGlobal));
    }
  }

  return translatedDocs;
}

/**
 * Asserts that a page was translated with a specific result.
 *
 * @param {string} message The assertion message.
 * @param {Function} getNodeOrText A function to get the node or plain text.
 * @param {string | Array<string>} oneOrMoreTranslations The translated message.
 */
export async function assertTranslationResult(
  message,
  getNodeOrText,
  oneOrMoreTranslations
) {
  const getText = () => {
    const nodeOrText = getNodeOrText();
    if (typeof nodeOrText === "string") {
      return nodeOrText;
    }
    return nodeOrText?.innerText;
  };

  let translation;
  try {
    if (typeof oneOrMoreTranslations === "string") {
      await waitForCondition(
        () => oneOrMoreTranslations === getText(),
        `Waiting for: "${oneOrMoreTranslations}"`
      );
      translation = oneOrMoreTranslations;
    } else {
      await waitForCondition(
        () =>
          oneOrMoreTranslations.find(translation => translation === getText()),
        `Waiting for: "${oneOrMoreTranslations}"`
      );
      translation = oneOrMoreTranslations.find(
        translation => translation === getText()
      );
    }
  } catch (error) {
    // The result wasn't found, but the assertion below will report the error.
    console.error(error);
  }

  is(translation, getText(), message);
}

/**
 * Assert that a node's HTML matches expected markup, ignoring whitespace between tags.
 * This mirrors the helper in shared-head.js's because this file cannot import it directly.
 *
 * @param {Element | null} node
 * @param {string} expectedHtml
 * @param {string} [message="HTML matches expected markup."]
 *
 * @returns {Promise<void>}
 */
export async function assertHtmlMatches(
  node,
  expectedHtml,
  message = "HTML matches expected markup."
) {
  // All characters that will need to be escaped with a backslash in the
  // final regex if they are contained within the HTML string.
  const escapableCharacters = /[.*+?^${}()|[\]\\]/g;
  const expected = new RegExp(
    `^${expectedHtml
      // Escape each character that needs it with a backslash.
      .replaceAll(escapableCharacters, "\\$&")
      // Add a 0+ blank space matcher \s* before each opening angle bracket <
      .replaceAll(/\s*</g, "\\s*<")
      // Add a 0+ blank space matcher \s* after each closing angle bracket >
      .replaceAll(/>\s*/g, ">\\s*")
      // Collapse more than one blank space into a 1+ matcher.
      .replaceAll(/\s\s+/g, "\\s+")
      // Replace a 1+ blank space matcher at the beginning with a 0+ matcher.
      .replace(/^\\s\+/, "\\s*")
      // Replace a 1+ blank space matcher at the end with a 0+ matcher.
      .replace(/\\s\+$/, "\\s*")}$`,
    "su"
  );
  if (node) {
    try {
      await waitForCondition(
        () => expected.test(node.outerHTML),
        "Waiting for HTML to match."
      );
    } catch (error) {
      console.error(error);
    }
  }

  const actualHtml = node?.outerHTML ?? "";

  ok(
    expected.test(actualHtml),
    `${message}\n\nExpected HTML:\n\n${expectedHtml}\n\nActual HTML:\n\n${actualHtml}`
  );
}

/**
 * Simulates right-clicking an element with the mouse.
 *
 * @param {element} element - The element to right-click.
 */
export function rightClickContentElement(element) {
  return new Promise(resolve => {
    element.addEventListener(
      "contextmenu",
      function () {
        resolve();
      },
      { once: true }
    );

    const EventUtils = ContentTaskUtils.getEventUtils(content);
    EventUtils.sendMouseEvent({ type: "contextmenu" }, element, content.window);
  });
}

/**
 * Selects all the content within a specified element.
 *
 * @param {Element} element - The element containing the content to be selected.
 * @returns {string} - The text content of the selection.
 */
export function selectContentElement(element) {
  content.focus();
  content.getSelection().selectAllChildren(element);
  return element.textContent;
}
