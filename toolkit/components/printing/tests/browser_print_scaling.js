/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function testInvalidScaleResetAfterDestinationChange() {
  const mockPrinterName = "Fake Printer";
  await PrintHelper.withTestPage(async helper => {
    helper.addMockPrinter(mockPrinterName);
    await helper.startPrint();

    let destinationPicker = helper.get("printer-picker");

    await helper.openMoreSettings();
    let scaleRadio = helper.get("percent-scale-choice");
    await helper.assertSettingsChanged(
      { shrinkToFit: true },
      { shrinkToFit: false },
      async () => {
        await helper.waitForPreview(() => helper.click(scaleRadio));
      }
    );
    let percentScale = helper.get("percent-scale");

    let scaleError = helper.get("error-invalid-scale");

    await helper.assertSettingsNotChanged({ scaling: 1 }, async () => {
      ok(scaleError.hidden, "Scale error is hidden");
      await helper.text(percentScale, "9");
      await BrowserTestUtils.waitForAttributeRemoval("hidden", scaleError);
      ok(!scaleError.hidden, "Scale error is showing");
    });

    is(destinationPicker.disabled, false, "Destination picker is enabled");

    // Select a new printer
    await helper.dispatchSettingsChange({ printerName: mockPrinterName });
    await BrowserTestUtils.waitForCondition(
      () => scaleError.hidden,
      "Wait for scale error to be hidden"
    );
    is(percentScale.value, "100", "Scale has reset to 100");

    await helper.closeDialog();
  });
});

add_task(async function testScaleUIUpdateAfterExit() {
  const mockPrinterName = "Scale";
  await PrintHelper.withTestPage(async helper => {
    helper.addMockPrinter(mockPrinterName);
    //push changes to mock printer before opening printer dialog
    await SpecialPowers.pushPrefEnv({
      set: [
        ["print.printer_Scale.print_scaling", "2"],
        ["print.printer_Scale.print_shrink_to_fit", false],
      ],
    });

    await helper.startPrint();
    await helper.openMoreSettings();

    let scaleRadio = helper.get("percent-scale-choice");
    let percentScale = helper.get("percent-scale");
    is(scaleRadio.checked, false, "Fit to page is set");
    is(percentScale.value, "100", "Default scale is set");

    percentScale = helper.get("percent-scale");
    await helper.openMoreSettings();

    // Switch to the mock printer
    await helper.dispatchSettingsChange({ printerName: mockPrinterName });
    await helper.waitForSettingsEvent();

    is(scaleRadio.checked, true, "Scale is set");
    is(percentScale.value, "200", "200% scaling is set");

    await helper.closeDialog();
  });
});
