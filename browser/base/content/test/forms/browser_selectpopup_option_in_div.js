const PAGE_CONTENT = `
<!doctype html>
<select>
<div>
<option>One</option>
<option>Two</option>
<option>Three</option>
</div>
</select>`;

// The parser keeps the wrapper <div> in the tree whether or not customizable
// select is enabled, so the dropdown has to list every <option> either way.
async function testOptionsInDiv(customizableSelect) {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["test.wait300msAfterTabSwitch", true],
      ["dom.select.customizable_select.enabled", customizableSelect],
    ],
  });

  const pageUrl = "data:text/html," + encodeURIComponent(PAGE_CONTENT);
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, pageUrl);

  const selectPopup = await openSelectPopup("click");
  const items = Array.from(selectPopup.children).filter(
    child => child.tagName == "menuitem"
  );

  Assert.deepEqual(
    items.map(item => item.textContent),
    ["One", "Two", "Three"],
    `Dropdown lists every option inside the wrapper div (customizable select: ${customizableSelect})`
  );

  await hideSelectPopup();
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
}

add_task(async function test_option_in_div_customizable_select_disabled() {
  await testOptionsInDiv(false);
});

add_task(async function test_option_in_div_customizable_select_enabled() {
  await testOptionsInDiv(true);
});
