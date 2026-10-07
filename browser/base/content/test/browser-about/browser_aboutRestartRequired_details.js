/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// about:restartrequired loads in the parent process, so its DOM nodes can be
// reached directly.
async function expandedState(toggle) {
  await toggle.updateComplete;
  return toggle.shadowRoot
    .querySelector("button")
    .getAttribute("aria-expanded");
}

add_task(async function test_more_details_toggle() {
  await BrowserTestUtils.withNewTab("about:restartrequired", async browser => {
    let doc = browser.contentDocument;
    let toggle = doc.getElementById("details-toggle");
    let details = doc.getElementById("more-details");

    // The a11y checks that run over synthetic clicks read layout without
    // flushing, so give the toggle a chance to be laid out first.
    await TestUtils.waitForCondition(
      () => toggle.getBoundingClientRect().height > 0,
      "Waiting for the toggle button to be laid out."
    );

    Assert.ok(details.hidden, "More details starts collapsed.");
    Assert.equal(
      toggle.getAttribute("data-l10n-id"),
      "restart-required-see-more-button",
      "Toggle offers to expand."
    );
    Assert.equal(
      await expandedState(toggle),
      "false",
      "Toggle reports itself as collapsed."
    );

    toggle.click();

    Assert.ok(!details.hidden, "More details is shown.");
    Assert.equal(
      toggle.getAttribute("data-l10n-id"),
      "restart-required-see-less-button",
      "Toggle offers to collapse."
    );
    Assert.equal(
      await expandedState(toggle),
      "true",
      "Toggle reports itself as expanded."
    );

    toggle.click();

    Assert.ok(details.hidden, "More details is collapsed again.");
    Assert.equal(
      toggle.getAttribute("data-l10n-id"),
      "restart-required-see-more-button",
      "Toggle offers to expand again."
    );
    Assert.equal(
      await expandedState(toggle),
      "false",
      "Toggle reports itself as collapsed again."
    );
  });
});
