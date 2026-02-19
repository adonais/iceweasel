"use strict";

const TEST_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_applied_memories_page.html";

add_task(async function test_applied_memories_button_basic() {
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      const doc = content.document;
      const button = doc.getElementById("test-button");

      button.messageId = "msg-1";
      button.appliedMemories = ["User is vegan", "User has a cat"];

      await content.customElements.whenDefined("applied-memories-button");

      let popover = button.shadowRoot.querySelector(".popover");
      ok(popover, "Popover element exists");
      ok(!popover.classList.contains("open"), "Popover is initially closed");

      const trigger = button.shadowRoot.querySelector(
        "moz-button.memories-trigger"
      );
      ok(trigger, "Found memories trigger");

      trigger.click();
      await content.Promise.resolve();

      popover = button.shadowRoot.querySelector(".popover");
      ok(
        popover.classList.contains("open"),
        "Popover opens after trigger click"
      );

      const items = button.shadowRoot.querySelectorAll(".memories-list-item");
      is(items.length, 2, "Two memories rendered initially");

      const removeButton = items[0].querySelector(".memories-remove-button");
      ok(removeButton, "Found remove button for first memory");

      let removeEventDetail = null;
      function onRemove(evt) {
        button.removeEventListener("remove-applied-memory", onRemove);
        removeEventDetail = evt.detail;
      }
      button.addEventListener("remove-applied-memory", onRemove);

      removeButton.click();
      await content.Promise.resolve();

      const itemsAfter = button.shadowRoot.querySelectorAll(
        ".memories-list-item"
      );
      is(itemsAfter.length, 1, "One memory remains after removal");

      ok(removeEventDetail, "remove-applied-memory event fired");
      is(removeEventDetail.messageId, "msg-1", "Event includes messageId");
      is(removeEventDetail.index, 0, "Event index is 0");

      doc.body.click();
      await content.Promise.resolve();

      popover = button.shadowRoot.querySelector(".popover");
      ok(
        !popover.classList.contains("open"),
        "Popover closes on outside click"
      );
    });
  });
});
