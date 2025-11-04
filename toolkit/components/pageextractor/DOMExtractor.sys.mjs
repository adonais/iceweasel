/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// @ts-check

/**
 * @param {Document} document
 * @returns {string}
 */
export function extractTextFromDOM(document) {
  const blocks = subdivideNodeIntoBlocks(document.body);

  let textContent = "";
  for (const block of blocks) {
    let innerText = "";
    const element = asHTMLElement(block);
    const text = asTextNode(block);

    if (element) {
      innerText = element.innerText.trim();
    } else if (text?.nodeValue) {
      innerText = text.nodeValue.trim();
    }
    if (innerText) {
      textContent += "\n" + innerText;
    }
  }

  return textContent;
}

/**
 * Tags excluded from text extraction.
 */
const CONTENT_EXCLUDED_TAGS = new Set([
  // TODO - We should add this and write some tests.
  "CODE",

  // The following are deprecated tags.
  "DIR",
  "APPLET",

  // The following are embedded elements, and are not supported (yet).
  "MATH",
  "EMBED",
  "OBJECT",
  "IFRAME",

  // This is an SVG tag that can contain arbitrary XML, ignore it.
  "METADATA",

  // These are elements that are treated as opaque by Firefox which causes their
  // innerHTML property to be just the raw text node behind it. Any text that is sent as
  // HTML must be valid, and there is no guarantee that the innerHTML is valid.
  "NOSCRIPT",
  "NOEMBED",
  "NOFRAMES",

  // Do not parse the HEAD tag.
  "HEAD",

  // These are not user-visible tags.
  "STYLE",
  "SCRIPT",
  "TEMPLATE",
]);

const CONTENT_EXCLUDED_NODE_SELECTOR = [...CONTENT_EXCLUDED_TAGS].join(",");

/**
 * Get the ShadowRoot from the chrome-only openOrClosedShadowRoot API.
 * This allows for extracting the content from WebComponents, which is not
 * normally feasible in non-privileged contexts.
 *
 * @param {Node} node
 *
 * @returns {ShadowRoot | null}
 */
function getShadowRoot(node) {
  return asElement(node)?.openOrClosedShadowRoot ?? null;
}

/**
 * Determines if a node is ready for text extraction, or if it should be subdivided
 * further. It doesn't check if the node has already been processed. This id done
 * at the block level.
 *
 * @param {Node} node
 * @returns {number} - NodeFilter acceptance status.
 */
function determineBlockStatus(node) {
  if (!node) {
    return NodeFilter.FILTER_REJECT;
  }
  if (getShadowRoot(node)) {
    return NodeFilter.FILTER_ACCEPT;
  }

  if (isExcludedNode(node)) {
    // This is an explicit.
    return NodeFilter.FILTER_REJECT;
  }

  if (
    containsExcludedNode(node, CONTENT_EXCLUDED_NODE_SELECTOR) &&
    !hasNonWhitespaceTextNodes(node)
  ) {
    // Skip this node, and dig deeper into its tree to cut off smaller pieces to extract.
    return NodeFilter.FILTER_SKIP;
  }

  if (nodeNeedsSubdividing(node)) {
    // Skip this node, and dig deeper into its tree to cut off smaller pieces
    // to extract. It is presumed to be a wrapper of block elements.
    return NodeFilter.FILTER_SKIP;
  }

  // This textContent call is fairly expensive.
  if (!node.textContent?.trim().length) {
    // Do not use subtrees that are empty of text.
    return !node.hasChildNodes()
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_SKIP;
  }

  // This node can be treated as entire block and is ready for text extraction.
  return NodeFilter.FILTER_ACCEPT;
}
/**
 * Determine if this element is an inline element or a block element.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function nodeNeedsSubdividing(node) {
  const element = asElement(node);
  if (!element) {
    // Only elements need to be further subdivided.
    return false;
  }

  for (let childNode of element.childNodes) {
    if (!childNode) {
      continue;
    }
    switch (childNode.nodeType) {
      case Node.TEXT_NODE: {
        // Keep checking for more inline or text nodes.
        continue;
      }
      case Node.ELEMENT_NODE: {
        if (getIsBlockLike(childNode)) {
          // This node is a block node, so it needs further subdividing.
          return true;
        } else if (nodeNeedsSubdividing(childNode)) {
          // This non-block-like node may contain other block-like nodes.
          return true;
        }

        // Keep checking for more inline or text nodes.
        continue;
      }
      default: {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true if an HTML element is hidden based on factors such as collapsed state and
 * computed style, otherwise false.
 *
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isHTMLElementHidden(element) {
  // This is a cheap and easy check that will not compute style or force reflow.
  if (element.hidden) {
    // The element is explicitly hidden.
    return true;
  }

  // Handle open/closed <details> elements. This will also not compute style or force reflow.
  // https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
  if (
    // The element is within a closed <details>
    element.closest("details:not([open])") &&
    // The element is not part of the <summary> of the <details>, which is always visible, even when closed.
    !element.closest("summary")
  ) {
    // The element is within a closed <details> and is not part of the <summary>, therefore it is not visible.
    return true;
  }

  // This forces reflow, which has a performance cost, but this is also what JQuery uses for its :hidden and :visible.
  // https://github.com/jquery/jquery/blob/bd6b453b7effa78b292812dbe218491624994526/src/css/hiddenVisibleSelectors.js#L1-L10
  if (
    !(
      element.offsetWidth ||
      element.offsetHeight ||
      element.getClientRects().length
    )
  ) {
    return true;
  }

  const { ownerGlobal } = element;
  if (!ownerGlobal) {
    // We cannot compute the style without ownerGlobal, so we will assume it is not visible.
    return true;
  }

  // This flushes the style, which is a performance cost.
  const style = ownerGlobal.getComputedStyle(element);
  if (!style) {
    // We were unable to compute the style, so we will assume it is not visible.
    return true;
  }

  // This is an issue with the DOM library generation.
  // @ts-expect-error Property 'display' does not exist on type 'CSSStyleDeclaration'.ts(2339)
  const { display, visibility, opacity } = style;

  return (
    display === "none" ||
    visibility === "hidden" ||
    visibility === "collapse" ||
    opacity === "0"
  );
}

/**
 * @param {Node} node
 */
function isExcludedNode(node) {
  // Property access be expensive, so destructure required properties so they are
  // not accessed multiple times.
  const { nodeType } = node;

  if (nodeType === Node.TEXT_NODE) {
    // Text nodes are never excluded.
    return false;
  }
  const element = asElement(node);
  if (!element) {
    // Only elements and and text nodes should be considered.
    return true;
  }

  const { nodeName } = element;

  if (CONTENT_EXCLUDED_TAGS.has(nodeName.toUpperCase())) {
    // SVG tags can be lowercased, so ensure everything is uppercased.
    // This is an excluded tag.
    return true;
  }

  return false;
}

/**
 * Like `#isExcludedNode` but looks at the full subtree. Used to see whether
 * we can consider a subtree, or whether we should split it into smaller
 * branches first to try to exclude more of the content.
 *
 * @param {Node} node
 * @param {string} excludedNodeSelector
 *
 * @returns {boolean}
 */
function containsExcludedNode(node, excludedNodeSelector) {
  return Boolean(asElement(node)?.querySelector(excludedNodeSelector));
}

/**
 * Test whether any of the direct child text nodes of are non-whitespace text nodes.
 *
 * For example:
 *   - `<p>test</p>`: yes
 *   - `<p> </p>`: no
 *   - `<p><b>test</b></p>`: no
 *
 * @param {Node} node
 *
 * @returns {boolean}
 */
function hasNonWhitespaceTextNodes(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    // Only check element nodes.
    return false;
  }

  for (const child of node.childNodes) {
    const textNode = asTextNode(child);
    if (textNode) {
      if (!textNode.textContent?.trim()) {
        // This is just whitespace.
        continue;
      }
      // A text node with content was found.
      return true;
    }
  }

  // No text nodes were found.
  return false;
}

/**
 * Start walking down through a node's subtree and decide which nodes to extract content
 * from. This first node is the root of the page.
 *
 * The nodes go through a process of subdivision until an appropriate sized chunk
 * of inline text can be found.
 *
 * @param {Node} node
 * @returns {Set<Node>}
 */
function subdivideNodeIntoBlocks(node) {
  /** @type {Set<Node>} */
  const blocks = new Set();
  switch (determineBlockStatus(node)) {
    case NodeFilter.FILTER_REJECT: {
      // This node is rejected as it shouldn't be used for text extraction.
      return blocks;
    }

    // Either a shadow host or a block element
    case NodeFilter.FILTER_ACCEPT: {
      const shadowRoot = getShadowRoot(node);
      if (shadowRoot) {
        processSubdivide(shadowRoot, blocks);
      } else {
        const element = asHTMLElement(node);
        if (element && isHTMLElementHidden(element)) {
          break;
        }
        if (noAncestorsAdded(node, blocks)) {
          blocks.add(node);
        }
      }
      break;
    }

    case NodeFilter.FILTER_SKIP: {
      // This node may have text to extract, but it needs to be subdivided into smaller
      // pieces. Create a TreeWalker to walk the subtree, and find the subtrees/nodes
      // that contain enough inline elements to extract.
      processSubdivide(node, blocks);
      break;
    }
  }
  return blocks;
}

/**
 * Add qualified nodes to have their text content extracted by recursively walking
 * through the DOM tree of nodes, including elements in the Shadow DOM.
 *
 * @param {Node} node
 * @param {Set<Node>} blocks
 */
function processSubdivide(node, blocks) {
  const { ownerDocument } = node;
  if (!ownerDocument) {
    return;
  }

  // This iterator will contain each node that has been subdivided enough to have its
  // text extracted.
  const nodeIterator = ownerDocument.createTreeWalker(
    node,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    determineBlockStatus
  );

  let currentNode;
  while ((currentNode = nodeIterator.nextNode())) {
    const shadowRoot = getShadowRoot(currentNode);
    if (shadowRoot) {
      processSubdivide(shadowRoot, blocks);
    } else if (noAncestorsAdded(currentNode, blocks)) {
      blocks.add(currentNode);
    }
  }
}

/**
 * TODO - The original TranslationsDocument algorithm didn't require this, so perhaps
 * something was not ported correctly. This should be removed to see if the error
 * can be reproduced, and this mitigation removed.
 *
 * @param {Node} node
 * @param {Set<Node>} blocks
 */
function noAncestorsAdded(node, blocks) {
  for (const ancestor of getAncestorsIterator(node)) {
    if (blocks.has(ancestor)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns an iterator of a node's ancestors.
 *
 * @param {Node} node
 *
 * @yields {Node}
 */
function* getAncestorsIterator(node) {
  const document = node.ownerDocument;
  if (!document) {
    return;
  }
  for (
    let parent = node.parentNode;
    parent && parent !== document.documentElement;
    parent = parent.parentNode
  ) {
    yield parent;
  }
}

/**
 * Reads the elements computed style and determines if the element is a block-like
 * element or not. Every element that lays out like a block should be used as a unit
 * for text extraction.
 *
 * @param {Node} node
 * @returns {boolean}
 */
function getIsBlockLike(node) {
  const element = asElement(node);
  if (!element) {
    return false;
  }

  const { ownerGlobal } = element;
  if (!ownerGlobal) {
    return false;
  }

  if (element.namespaceURI === "http://www.w3.org/2000/svg") {
    // SVG elements will report as inline, but there is no block layout in SVG.
    // Treat every SVG element as being block so that every node will be subdivided.
    return true;
  }

  /** @type {Record<string, string>} */
  // @ts-expect-error - This is a workaround for the CSSStyleDeclaration not being indexable.
  const style = ownerGlobal.getComputedStyle(element) ?? { display: null };

  return style.display !== "inline" && style.display !== "none";
}

/**
 * Use TypeScript to determine if the Node is an Element.
 *
 * @param {Node | null | undefined} node
 * @returns {Element | null}
 */
function asElement(node) {
  if (node?.nodeType === Node.ELEMENT_NODE) {
    return /** @type {HTMLElement} */ (node);
  }
  return null;
}

/**
 * Use TypeScript to determine if the Node is an Element.
 *
 * @param {Node | null} node
 *
 * @returns {Text | null}
 */
function asTextNode(node) {
  if (node?.nodeType === Node.TEXT_NODE) {
    return /** @type {Text} */ (node);
  }
  return null;
}

/**
 * Use TypeScript to determine if the Node is an HTMLElement.
 *
 * @param {Node | null} node
 *
 * @returns {HTMLElement | null}
 */
function asHTMLElement(node) {
  if (HTMLElement.isInstance(node)) {
    return node;
  }
  return null;
}
