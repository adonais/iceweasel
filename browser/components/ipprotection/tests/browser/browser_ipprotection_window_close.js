/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that the per-window IPProtectionPanel and IPProtectionToolbarButton
 * are uninitialized when their browser window closes.
 *
 * Both register listeners on the global IPProtection singletons
 * (IPProtectionService, IPPProxyManager, ...) in their constructors and only
 * remove them in uninit(). If uninit() isn't called on window close, the
 * instances stay reachable through those listener lists and leak, one per
 * closed window.
 */
add_task(async function uninit_per_window_instances_on_window_close() {
  let win = await BrowserTestUtils.openNewBrowserWindow();

  let panel = IPProtection.getPanel(win);
  let toolbarButton = IPProtection.getToolbarButton(win);

  Assert.ok(panel, "A panel was created for the new window");
  Assert.ok(toolbarButton, "A toolbar button was created for the new window");

  let sandbox = sinon.createSandbox();
  let panelUninit = sandbox.spy(panel, "uninit");
  let toolbarButtonUninit = sandbox.spy(toolbarButton, "uninit");

  await BrowserTestUtils.closeWindow(win);

  Assert.ok(
    panelUninit.calledOnce,
    "The window's panel was uninitialized when the window closed"
  );
  Assert.ok(
    toolbarButtonUninit.calledOnce,
    "The window's toolbar button was uninitialized when the window closed"
  );

  sandbox.restore();
});

/**
 * Tests that the per-window panel and toolbar button are garbage collected
 * once their window closes.
 */
add_task(async function collect_per_window_instances_after_window_close() {
  let win = await BrowserTestUtils.openNewBrowserWindow();

  // Don't bind the instances to locals, or the test would keep them alive.
  let panelRef = Cu.getWeakReference(IPProtection.getPanel(win));
  let toolbarButtonRef = Cu.getWeakReference(
    IPProtection.getToolbarButton(win)
  );

  Assert.ok(panelRef.get(), "A panel exists for the new window");
  Assert.ok(
    toolbarButtonRef.get(),
    "A toolbar button exists for the new window"
  );

  await BrowserTestUtils.closeWindow(win);
  win = null;

  await new Promise(resolve => SpecialPowers.exactGC(resolve));

  Assert.ok(!panelRef.get(), "The panel was garbage collected");
  Assert.ok(
    !toolbarButtonRef.get(),
    "The toolbar button was garbage collected"
  );
});
