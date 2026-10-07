/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A code block, a diagram and a wide table scroll horizontally in a container
// that takes no focus, so whatever sits past the edge is reachable by wheel or
// drag only, where WCAG 2.1.1 asks for keyboard operation. A container takes
// focus while it overflows and stops taking it when it does not, so nothing
// whose content fits costs a tab stop.

// The theme's horizontal scroll containers: a code block's and a diagram's
// <pre>, and the wrapper a wide table gets.
const SCROLL_CONTAINERS = "pre, .wy-table-responsive";

document.addEventListener("DOMContentLoaded", () => {
  const content = document.querySelector(".rst-content");

  const update = () => {
    for (const container of content.querySelectorAll(SCROLL_CONTAINERS)) {
      if (container.scrollWidth > container.clientWidth) {
        container.tabIndex = 0;
      } else if (!container.contains(document.activeElement)) {
        // Dropping the attribute out from under the reader's own focus would
        // send it back to the start of the document.
        container.removeAttribute("tabindex");
      }
    }
  };

  update();

  // Neither the markup nor the first layout settles what overflows: a diagram
  // is drawn after load and redrawn on a color-scheme change, and a collapsed
  // block's content has no size until it is opened.
  new ResizeObserver(update).observe(content);
  new MutationObserver(update).observe(content, {
    childList: true,
    subtree: true,
  });
});
