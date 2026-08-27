/* eslint-disable-next-line no-unused-vars */
import * as _websiteChipContainer from "chrome://browser/content/aiwindow/components/website-chip-container.mjs";
/* eslint-disable-next-line no-unused-vars */
import * as _aiActionResult from "chrome://browser/content/aiwindow/components/ai-action-result.mjs";

/**
 * Resolve once the row has finished measuring.
 *
 * @param {Element} element - The `website-chip-container` to wait on
 * @returns {Promise<void>}
 */
window.settleOverflow = async element => {
  // Wait for resize observations after rAF callbacks.
  await new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
  // A measure can change the count result in a rerender.
  while (element.isMeasuring) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await element.updateComplete;
  }
  await element.updateComplete;
};

/**
 * Read the visible/overflow split from a rendered row.
 *
 * @param {Element} element - The `website-chip-container` to read
 * @returns {object} Counts and state of the row and its “+n more” button
 */
window.readOverflowRow = element => {
  const row = element.shadowRoot.querySelector(".chip-container-scroller");
  const items = [...row.querySelectorAll(":scope > [role='listitem']")];
  const button = row.querySelector(".overflow-more");
  const buttonHidden = button?.hasAttribute("data-overflow") ?? null;
  return {
    isSmartwindowOverflowRow: row.classList.contains(
      "smartwindow-overflow-row"
    ),
    total: items.length,
    visible: items.filter(item => !item.hasAttribute("data-overflow")).length,
    buttonHidden,
    buttonLabel: buttonHidden ? null : (button?.textContent.trim() ?? null),
    hasPanel: !!row.querySelector("smartwindow-panel-list"),
  };
};
