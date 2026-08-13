/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function openMoreToolsMenu() {
  if (window.PanelUI.panel.state !== "closed") {
    const panelHidden = BrowserTestUtils.waitForEvent(
      window.PanelUI.panel,
      "popuphidden"
    );
    window.PanelUI.hide();
    await panelHidden;
  }

  const panelShown = BrowserTestUtils.waitForEvent(
    window.PanelUI.panel,
    "popupshown"
  );
  window.PanelUI.show();
  await panelShown;

  const moreToolsShown = BrowserTestUtils.waitForEvent(
    window.PanelMultiView.getViewNode(document, "appmenu-moreTools"),
    "ViewShown"
  );
  document.getElementById("appMenu-more-button2").click();
  await moreToolsShown;
}

async function clickEditPDFMenuItem() {
  const panelHidden = BrowserTestUtils.waitForEvent(
    window.PanelUI.panel,
    "popuphidden"
  );
  window.PanelMultiView.getViewNode(
    document,
    "appmenu-edit-pdf-button"
  ).click();
  await panelHidden;
}

add_task(async function test_app_menu_entry_opens_about_pdf() {
  const initialTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    "about:pdf",
    true
  );

  await openMoreToolsMenu();
  await clickEditPDFMenuItem();

  const pdfTab = await newTabPromise;
  is(gBrowser.selectedTab, pdfTab, "The app menu entry opens about:pdf.");

  BrowserTestUtils.removeTab(pdfTab);
  BrowserTestUtils.removeTab(initialTab);
});

add_task(async function test_app_menu_entry_reuses_about_pdf_tab() {
  const pdfTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:pdf"
  );
  const initialTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const tabCount = gBrowser.tabs.length;
  const tabSelected = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabSelect",
    false,
    event => event.target == pdfTab
  );

  await openMoreToolsMenu();
  await clickEditPDFMenuItem();
  await tabSelected;

  is(gBrowser.selectedTab, pdfTab, "The app menu entry selects about:pdf.");
  is(gBrowser.tabs.length, tabCount, "No extra about:pdf tab was opened.");

  BrowserTestUtils.removeTab(initialTab);
  BrowserTestUtils.removeTab(pdfTab);
});
