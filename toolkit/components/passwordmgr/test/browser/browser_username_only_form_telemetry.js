/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function setupForms(numUsernameOnly, numBasic) {
  const TEST_HOSTNAME = "https://example.com";
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_HOSTNAME + DIRECTORY_PATH + "empty.html"
  );

  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [
      {
        numUsernameOnly,
        numBasic,
      },
    ],
    async function (data) {
      // type: 1: basic, 2:usernameOnly, 3:other
      function addForm(type) {
        const form = content.document.createElement("form");
        content.document.body.appendChild(form);

        const user = content.document.createElement("input");
        if (type === 3) {
          user.type = "url";
        } else {
          user.type = "text";
          user.autocomplete = "username";
        }
        form.appendChild(user);

        if (type === 1) {
          const password = content.document.createElement("input");
          password.type = "password";
          form.appendChild(password);
        }
      }
      for (let i = 0; i < data.numBasic; i++) {
        addForm(1);
      }
      for (let i = 0; i < data.numUsernameOnly; i++) {
        addForm(2);
      }
      for (let i = 0; i < data.numOther; i++) {
        addForm(3);
      }
    }
  );

  return tab;
}

add_setup(async function () {
  SpecialPowers.pushPrefEnv({
    set: [
      ["signon.usernameOnlyForm.enabled", true],
      ["signon.usernameOnlyForm.lookupThreshold", 100], // ignore the threshold in test
    ],
  });

  // Make absolutely certain there's no in-flight data that might pollute the test.
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
});

add_task(async function test_oneUsernameOnlyForm() {
  Services.fog.testResetFOG();
  const numUsernameOnlyForms = 1;
  const numBasicForms = 0;

  let tab = await setupForms(numUsernameOnlyForms, numBasicForms);

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.isUsernameOnlyForm.true.testGetValue(),
    numUsernameOnlyForms,
    "Username-only forms counted"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_multipleUsernameOnlyForms() {
  Services.fog.testResetFOG();
  const numUsernameOnlyForms = 3;
  const numBasicForms = 2;

  let tab = await setupForms(numUsernameOnlyForms, numBasicForms);

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.isUsernameOnlyForm.true.testGetValue(),
    numUsernameOnlyForms,
    "Username-only forms counted"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_multipleDocument() {
  Services.fog.testResetFOG();
  // The first document
  let numUsernameOnlyForms1 = 2;
  let numBasicForms1 = 2;

  let tab1 = await setupForms(numUsernameOnlyForms1, numBasicForms1);

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.isUsernameOnlyForm.true.testGetValue(),
    numUsernameOnlyForms1,
    "Username-only forms counted"
  );

  // The second document
  let numUsernameOnlyForms2 = 15;
  let numBasicForms2 = 3;

  let tab2 = await setupForms(numUsernameOnlyForms2, numBasicForms2);

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.isUsernameOnlyForm.true.testGetValue(),
    numUsernameOnlyForms1 + numUsernameOnlyForms2,
    "Username-only forms counted across documents"
  );

  // the result is stacked, so the new document add a counter to all
  // buckets under "numUsernameOnlyForms2 + numBasicForms2"

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

add_task(async function test_tooManyUsernameOnlyForms() {
  Services.fog.testResetFOG();
  const numUsernameOnlyForms = 25;
  const numBasicForms = 2;

  let tab = await setupForms(numUsernameOnlyForms, numBasicForms);

  await Services.fog.testFlushAllChildren();
  Assert.equal(
    Glean.pwmgr.isUsernameOnlyForm.true.testGetValue(),
    numUsernameOnlyForms,
    "Username-only forms counted"
  );

  BrowserTestUtils.removeTab(tab);
});
