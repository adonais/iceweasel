const OUTER_URL =
  "https://test1.example.com:443" + DIRECTORY_PATH + "form_crossframe.html";

requestLongerTimeout(2);

async function acceptPasswordSave() {
  let notif = await getCaptureDoorhangerThatMayOpen("password-save");
  let promiseNewSavedPassword = TestUtils.topicObserved(
    "LoginStats:NewSavedPassword",
    (subject, _topic, _data) => subject == gBrowser.selectedBrowser
  );
  clickDoorhangerButton(notif, REMEMBER_BUTTON);
  await promiseNewSavedPassword;
}

function checkFormFields(browsingContext, prefix, username, password) {
  return SpecialPowers.spawn(
    browsingContext,
    [prefix, username, password],
    (formPrefix, expectedUsername, expectedPassword) => {
      let doc = content.document;
      Assert.equal(
        doc.getElementById(formPrefix + "-username").value,
        expectedUsername,
        "username matches"
      );
      Assert.equal(
        doc.getElementById(formPrefix + "-password").value,
        expectedPassword,
        "password matches"
      );
    }
  );
}

function listenForNotifications(count, expectedFormOrigins = []) {
  return new Promise(resolve => {
    let notifications = [];
    LoginManagerParent.setListenerForTests((msg, data) => {
      if (msg == "FormProcessed") {
        notifications.push("FormProcessed: " + data.browsingContext.id);
      } else if (msg == "ShowDoorhanger") {
        Assert.ok(
          expectedFormOrigins.includes(data.origin),
          "Message origin should match expected"
        );
        notifications.push("FormSubmit: " + data.data.usernameField.name);
      }
      if (notifications.length == count) {
        resolve(notifications);
      }
    });
  });
}

async function verifyNotifications(notifyPromise, expected) {
  let actual = await notifyPromise;

  Assert.equal(actual.length, expected.length, "Extra notification(s) sent");
  let expectedItem;
  while ((expectedItem = expected.pop())) {
    let index = actual.indexOf(expectedItem);
    if (index >= 0) {
      actual.splice(index, 1);
    } else {
      Assert.ok(false, "Expected notification '" + expectedItem + "' not sent");
    }
  }
}

// Make sure there is an autocomplete result for the frame's saved login and select it.
async function autocompleteLoginInIFrame(
  browser,
  iframeBrowsingContext,
  selector
) {
  let popup = document.getElementById("PopupAutoComplete");
  Assert.ok(popup, "Got popup");

  await openACPopup(popup, browser, selector, iframeBrowsingContext);

  let autocompleteLoginResult = popup.querySelector(
    `[originaltype="loginWithOrigin"]`
  );
  Assert.ok(autocompleteLoginResult, "Got login richlistitem");

  let promiseHidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");

  await EventUtils.synthesizeKey("KEY_ArrowDown");
  await EventUtils.synthesizeKey("KEY_Enter");

  await promiseHidden;
}

/*
 * In this test, a frame is loaded with a document that contains a username
 * and password field. This frame also contains another cross-origin child iframe that
 * itself contains a username and password field.
 *
 * locationMode = false - form is submitted by form submit event
 * locationMode = true  - form is submitted by changing the location
 *                        Note: When the location is changed, the page is navigated and let's
 *                              its parent know of the page navigation. The parent notifies all
 *                              (same and cross-origin) child frames to submit their existing login forms
 */
async function submitSomeCrossSiteFrames(locationMode) {
  info("Check with location mode " + locationMode);
  let notifyPromise = listenForNotifications(2);

  let firsttab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    OUTER_URL
  );

  let outerFrameBC = firsttab.linkedBrowser.browsingContext;
  let innerFrameBC = outerFrameBC.children[0];

  await verifyNotifications(notifyPromise, [
    "FormProcessed: " + outerFrameBC.id,
    "FormProcessed: " + innerFrameBC.id,
  ]);

  // Fill in the username and password for both the outer and inner frame
  // and submit the inner frame.
  notifyPromise = listenForNotifications(1, ["https://test2.example.org"]);

  info("Submit inner page after changing outer and inner form");

  await SpecialPowers.spawn(outerFrameBC, [], () => {
    let doc = content.document;
    doc.getElementById("outer-username").setUserInput("outer");
    doc.getElementById("outer-password").setUserInput("outerpass");
  });

  await SpecialPowers.spawn(innerFrameBC, [locationMode], doClick => {
    let doc = content.document;
    doc.getElementById("inner-username").setUserInput("inner");
    doc.getElementById("inner-password").setUserInput("innerpass");
    if (doClick) {
      doc.getElementById("inner-gobutton").click();
    } else {
      doc.getElementById("inner-form").submit();
    }
  });

  await verifyNotifications(notifyPromise, ["FormSubmit: username"]);

  await acceptPasswordSave();

  // Next, open a second tab with the same page in it to verify that the data gets filled properly.
  notifyPromise = listenForNotifications(2);
  let secondtab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    OUTER_URL
  );

  let outerFrameBC2 = secondtab.linkedBrowser.browsingContext;
  let innerFrameBC2 = outerFrameBC2.children[0];
  await verifyNotifications(notifyPromise, [
    "FormProcessed: " + outerFrameBC2.id,
    "FormProcessed: " + innerFrameBC2.id,
  ]);

  // We don't expect the innerFrame to be autofilled with the saved login, since
  // it is cross-origin with the top level frame, so we autocomplete instead.
  info("Autocompleting saved login into inner form");
  await autocompleteLoginInIFrame(
    secondtab.linkedBrowser,
    innerFrameBC2,
    "#inner-username"
  );

  await checkFormFields(outerFrameBC2, "outer", "", "");
  await checkFormFields(innerFrameBC2, "inner", "inner", "innerpass");

  // Next, change the username and password fields in the outer frame and submit.
  notifyPromise = listenForNotifications(2, [
    "https://test1.example.com", // outer origin
    "https://test2.example.org", // inner origin, unchaned values
  ]);

  info(
    "Submit outer page after changing outer form and autocompleting inner form"
  );

  await SpecialPowers.spawn(outerFrameBC2, [locationMode], doClick => {
    let doc = content.document;
    doc.getElementById("outer-username").setUserInput("outer2");
    doc.getElementById("outer-password").setUserInput("outerpass2");
    if (doClick) {
      doc.getElementById("outer-gobutton").click();
    } else {
      doc.getElementById("outer-form").submit();
    }
  });

  // Only the outer values are goign to be captured,
  // because the outer values were changed and the inner values remain unchanged
  await verifyNotifications(notifyPromise, [
    "FormSubmit: outer-username",
    "FormSubmit: username",
  ]);

  await acceptPasswordSave();

  // Finally, open a third tab with the same page in it to verify that the data gets filled properly.
  notifyPromise = listenForNotifications(2);
  let thirdtab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    OUTER_URL
  );

  let outerFrameBC3 = thirdtab.linkedBrowser.browsingContext;
  let innerFrameBC3 = outerFrameBC3.children[0];
  await verifyNotifications(notifyPromise, [
    "FormProcessed: " + outerFrameBC3.id,
    "FormProcessed: " + innerFrameBC3.id,
  ]);

  // We don't expect the innerFrame to be autofilled with the saved login, since
  // it is cross-origin with the top level frame, so we autocomplete instead.
  info("Autocompleting saved login into inner form");
  await autocompleteLoginInIFrame(
    thirdtab.linkedBrowser,
    innerFrameBC3,
    "#inner-username"
  );

  await checkFormFields(outerFrameBC3, "outer", "outer2", "outerpass2");
  await checkFormFields(innerFrameBC3, "inner", "inner", "innerpass");

  LoginManagerParent.setListenerForTests(null);

  await BrowserTestUtils.removeTab(firsttab);
  await BrowserTestUtils.removeTab(secondtab);
  await BrowserTestUtils.removeTab(thirdtab);

  LoginTestUtils.clearData();
}

add_task(async function cross_site_frames_submit() {
  await submitSomeCrossSiteFrames(false);
});

add_task(async function cross_site_frames_changelocation() {
  await submitSomeCrossSiteFrames(true);
});
