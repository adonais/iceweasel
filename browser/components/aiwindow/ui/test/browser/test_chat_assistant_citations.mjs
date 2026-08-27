/* eslint-disable-next-line no-unused-vars */
import * as _chatAssistantCitations from "chrome://browser/content/aiwindow/components/chat-assistant-citations.mjs";

/**
 * Resolve once the row has finished measuring.
 *
 * @param {Element} element - The `chat-assistant-citations` to wait on
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
