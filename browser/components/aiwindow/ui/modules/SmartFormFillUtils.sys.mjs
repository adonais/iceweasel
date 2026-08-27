/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Utility methods for finding nearby text around form controls.
 */
export class SmartFormFillUtils {
  /**
   * Nearby text cached for reverse traversal.
   *
   * @type {WeakMap<Node, string> | null}
   */
  #mappedTextReverse = null;

  /**
   * Nearby text cached for forward traversal.
   *
   * @type {WeakMap<Node, string> | null}
   */
  #mappedTextForward = null;

  /**
   * Iterate over the nodes in a tree and call the filter on each one. We
   * don't use an existing iterator (such as a TreeWalker) because we want
   * to traverse the tree by visting the parents along the way first. The
   * filter should return exactly false if the node is not accepted and
   * iteration should continue. Otherwise, the value returned by the filter
   * is returned. The iteration also stops and returns null if
   * shouldStopIterating returns true for an element.
   *
   * @param {Node} element Element to start iterating from
   * @param {boolean} reverse Direction boolean
   * @param {Function} filter Filter function
   *
   * @returns {Node | null}
   */
  iterateNodes(element, reverse, filter) {
    while (element) {
      let next = reverse ? element.previousSibling : element.nextSibling;
      if (!next) {
        element = element.parentNode;
        if (element && this.shouldStopIterating(element)) {
          return null;
        }
      } else {
        let child = next;
        while (child) {
          if (filter) {
            let filterResult = filter(child);
            if (filterResult !== false) {
              return filterResult;
            }
          }

          if (
            child.nodeType == Node.ELEMENT_NODE &&
            this.shouldStopIterating(child)
          ) {
            return null;
          }

          element = child;
          child = reverse ? child.lastChild : child.firstChild;
        }
      }
    }

    return null;
  }

  /**
   * Return true if this is a form control or other element where iterating
   * should stop.
   *
   * @param {Node} element
   *
   * @returns {boolean}
   */
  shouldStopIterating(element) {
    return [
      "button",
      "input",
      "label",
      "meter",
      "output",
      "progress",
      "select",
      "textarea",
      "form",
      "fieldset",
      "script",
      "style",
    ].includes(element.localName);
  }

  /**
   * Clears the nearby-text cache
   */
  clearCache() {
    this.#mappedTextReverse = new WeakMap();
    this.#mappedTextForward = new WeakMap();
  }

  /**
   * Given an element that doesn't have an associated label, iterate in
   * either direction and find inline text nearby that likely serves as the label.
   *
   * @param {Node} element Element to look for nearby text
   * @param {boolean} [reverse=true] Direction to look in
   *
   * @returns {string}
   */
  findNearbyText(element, reverse = true) {
    if (!this.#mappedTextReverse) {
      this.#mappedTextReverse = new WeakMap();
    }

    if (!this.#mappedTextForward) {
      this.#mappedTextForward = new WeakMap();
    }

    const cache = reverse ? this.#mappedTextReverse : this.#mappedTextForward;

    if (cache.has(element)) {
      return cache.get(element);
    }

    let txt = "";
    let current = element;

    // A simple guard to prevent searching too far.
    let count = 10;

    let returnTextNode = node => {
      // As a shortcut, if text was already found, stop iterating when a
      // div element was found.
      if (
        !count-- ||
        (node.nodeType == Node.ELEMENT_NODE &&
          node.localName == "div" &&
          txt.length)
      ) {
        return null;
      }

      return node.nodeType == Node.TEXT_NODE ? node : false;
    };

    while ((current = this.iterateNodes(current, reverse, returnTextNode))) {
      let textContent = current.nodeValue;
      if (textContent) {
        if (reverse) {
          // Prepend the found text.
          txt = textContent + txt;
        } else {
          txt += textContent;
        }
      }
    }

    // Always add the element even where there is no text, so that it isn't
    // searched for again.
    txt = txt.replace(/\s{2,}/g, " ").trim(); // Collapse duplicate whitespaces
    cache.set(element, txt);
    return txt;
  }
}

export default SmartFormFillUtils;
