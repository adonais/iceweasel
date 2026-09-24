/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The field takes the page's direction rather than its value's, so a string
// typed in an RTL locale stays on the right whatever script it is in.

"use strict";

add_task(async function rtlPage() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();

  await NewtabSearchbarTestUtils.spawn(tab.linkedBrowser, [], async () => {
    let input = NewtabSearchbarContentTestUtils.getUrlbar(content).inputField;
    content.document.documentElement.dir = "rtl";

    Assert.ok(
      !input.hasAttribute("dir"),
      "the field has no direction of its own"
    );
    Assert.equal(
      content.getComputedStyle(input).textAlign,
      "start",
      "nothing overrides the alignment"
    );

    for (let value of ["", "left or right?", "مرحبا"]) {
      input.value = value;
      Assert.equal(
        content.getComputedStyle(input).direction,
        "rtl",
        `the field is laid out RTL holding ${JSON.stringify(value)}`
      );
    }
  });

  BrowserTestUtils.removeTab(tab);
});
