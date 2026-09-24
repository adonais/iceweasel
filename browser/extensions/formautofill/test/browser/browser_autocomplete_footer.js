"use strict";

const { SmartFormFillAutocomplete } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/SmartFormFillAutocomplete.sys.mjs"
);

const URL = BASE_URL + "autocomplete_basic.html";

const l10n = new Localization(["toolkit/formautofill/formAutofill.ftl"], true);

add_setup(async function setup_storage() {
  await setStorage(
    TEST_ADDRESS_2,
    TEST_ADDRESS_3,
    TEST_ADDRESS_4,
    TEST_ADDRESS_5,
    TEST_CREDIT_CARD_1
  );
});

function getFooterLabel(itemsBox) {
  let footer = itemsBox.getItemAtIndex(itemsBox.itemCount - 1);
  while (footer.collapsed) {
    footer = footer.previousSibling;
  }

  return footer.querySelector("autocomplete-row-item").label;
}

add_task(async function test_footer_has_correct_button_text_on_address() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: URL },
    async function (browser) {
      const {
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;

      await openPopupOn(browser, "#organization");
      let footer = getFooterLabel(itemsBox);
      Assert.equal(
        footer,
        l10n.formatValueSync("autofill-manage-addresses-label")
      );
      await closePopup(browser);
    }
  );
});

add_task(async function test_smart_form_fill_with_address_results() {
  const source = {
    label: "Source tab",
    favicon: "page-icon:https://example.com/",
  };
  const item = {
    style: "smartFormFill",
    value: "",
    image: "chrome://browser/skin/smart-window-simplified.svg",
    label: "Smart Form Fill",
    comment: JSON.stringify({
      type: "smartFormFill",
      sources: [source],
      sourcesLabel: "Sources:",
      ariaLabel: "Smart Form Fill",
      loading: false,
      loadingLabel: "Loading...",
      emptySourcesLabel: null,
      fillMessageName: "SmartFormFill:Start",
      fillMessageData: {},
      secondaryAction: {
        type: "edit",
        fillMessageName: "FormAutofill:EditSmartFormFillSources",
        fillMessageData: {},
      },
    }),
  };
  const autocompleteStub = sinon
    .stub(SmartFormFillAutocomplete, "autocompleteItemsAsync")
    .resolves([item]);

  try {
    await BrowserTestUtils.withNewTab(
      { gBrowser, url: URL },
      async function (browser) {
        try {
          await openPopupOn(browser, "#organization");

          const addressItems = getDisplayedPopupItems(
            browser,
            '[originaltype="autofill"]'
          );
          Assert.greater(
            addressItems.length,
            0,
            "Address autofill rows remain in the popup"
          );

          const smartFormFillItems = getDisplayedPopupItems(
            browser,
            '[originaltype="smartFormFill"]'
          );
          Assert.equal(
            smartFormFillItems.length,
            1,
            "The Smart Form Fill row is present"
          );

          const displayedItems = getDisplayedPopupItems(browser);
          const footer = displayedItems.find(candidate =>
            candidate.hasAttribute("footer")
          );
          Assert.ok(footer, "The Manage addresses footer is present");
          Assert.less(
            displayedItems.indexOf(addressItems.at(-1)),
            displayedItems.indexOf(smartFormFillItems[0]),
            "The Smart Form Fill row comes after the address rows"
          );
          Assert.less(
            displayedItems.indexOf(smartFormFillItems[0]),
            displayedItems.indexOf(footer),
            "The Smart Form Fill row comes before the footer"
          );

          const row = smartFormFillItems[0].querySelector(
            "autocomplete-row-item"
          );
          await row.updateComplete;

          Assert.equal(
            row.type,
            "smartFormFill",
            "The specialized row type is preserved"
          );
          Assert.equal(row.label, item.label, "The row label is preserved");
          Assert.deepEqual(
            row.sources,
            [source],
            "The row sources are preserved"
          );
        } finally {
          await closePopup(browser);
        }
      }
    );
  } finally {
    autocompleteStub.restore();
  }
});

add_task(async function test_footer_has_correct_button_text_on_credit_card() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      const {
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;

      await openPopupOn(browser, "#cc-number");
      let footer = getFooterLabel(itemsBox);
      Assert.equal(
        footer,
        l10n.formatValueSync("autofill-manage-payment-methods-label")
      );
      await closePopup(browser);
    }
  );
});

add_task(async function test_press_enter_on_footer() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: URL },
    async function (browser) {
      await openPopupOn(browser, "#organization");

      // Navigate to the footer and press enter.
      const listItemElems = getDisplayedPopupItems(browser);
      const prefTabPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        PRIVACY_PREF_URL,
        true
      );
      for (let i = 0; i < listItemElems.length; i++) {
        if (!listItemElems[i].disabled) {
          await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
        }
      }
      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      info(`expecting tab: about:preferences#privacy opened`);
      const prefTab = await prefTabPromise;
      info(`expecting tab: about:preferences#privacy removed`);
      BrowserTestUtils.removeTab(prefTab);
      ok(
        true,
        "Tab: preferences#privacy was successfully opened by pressing enter on the footer"
      );

      await closePopup(browser);
    }
  );
});

add_task(async function test_click_on_footer() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: URL },
    async function (browser) {
      const {
        autoCompletePopup: { richlistbox: itemsBox },
      } = browser;

      await openPopupOn(browser, "#organization");
      // Click on the footer

      let optionButton = itemsBox.querySelector(
        ".autocomplete-row-item[footer]"
      );
      while (optionButton.collapsed) {
        optionButton = optionButton.previousElementSibling;
      }

      const prefTabPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        PRIVACY_PREF_URL,
        true
      );
      // The rows can overflow the list while the popup is still being sized,
      // leaving the footer outside it. Its center is then over the page, so the
      // click would dismiss the popup. isVisible() ignores clipping.
      await TestUtils.waitForCondition(() => {
        if (!BrowserTestUtils.isVisible(optionButton)) {
          return false;
        }
        const listRect = itemsBox.getBoundingClientRect();
        const footerRect = optionButton.getBoundingClientRect();
        return (
          footerRect.height &&
          footerRect.top >= listRect.top &&
          footerRect.bottom <= listRect.bottom
        );
      }, "the footer to be inside the list");
      EventUtils.synthesizeMouseAtCenter(optionButton, {});
      info(`expecting tab: about:preferences#privacy opened`);
      const prefTab = await prefTabPromise;
      info(`expecting tab: about:preferences#privacy removed`);
      BrowserTestUtils.removeTab(prefTab);
      ok(
        true,
        "Tab: preferences#privacy was successfully opened by clicking on the footer"
      );

      await closePopup(browser);
    }
  );
});
