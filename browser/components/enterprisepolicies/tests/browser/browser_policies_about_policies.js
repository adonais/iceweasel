/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_partially_applied_policy_is_flagged() {
  // browser.startup.page is an integer preference, so setting it to a string
  // fails and the policy is only partially applied.
  await setupPolicyEngineWithJson({
    policies: {
      Preferences: {
        "browser.startup.page": "1",
        "browser.altClickSave": true,
      },
    },
  });

  await BrowserTestUtils.withNewTab("about:policies", async browser => {
    let doc = browser.contentDocument;

    let cell = doc.querySelector("#activeContent td.policy-failure");
    Assert.ok(cell, "The policy is flagged in the Active tab");
    Assert.ok(
      cell.querySelector(".policy-failure-marker"),
      "The flag is rendered on the policy name"
    );

    Assert.ok(
      !doc.getElementById("category-errors").hidden,
      "The Errors tab is available"
    );
    let errorRow = Array.from(doc.querySelectorAll("#errorsContent tr")).find(
      row => row.cells[1]?.textContent.includes("browser.startup.page")
    );
    Assert.ok(errorRow, "The failure is listed in the Errors tab");
    Assert.equal(
      errorRow.cells[0].textContent,
      "Preferences",
      "The failure is listed against the policy it belongs to"
    );
    Assert.equal(
      Array.from(doc.querySelectorAll("#errorsContent tr")).filter(row =>
        row.cells[1]?.textContent.includes("browser.startup.page")
      ).length,
      1,
      "The failure is not listed twice"
    );
  });
});

add_task(async function test_applied_policy_is_not_flagged() {
  await setupPolicyEngineWithJson({
    policies: {
      Preferences: {
        "browser.altClickSave": true,
      },
    },
  });

  await BrowserTestUtils.withNewTab("about:policies", async browser => {
    let doc = browser.contentDocument;

    Assert.ok(
      doc.querySelector("#activeContent tr"),
      "The policy is listed in the Active tab"
    );
    Assert.ok(
      !doc.querySelector("#activeContent .policy-failure-marker"),
      "A policy that applied cleanly is not flagged"
    );
  });
});
