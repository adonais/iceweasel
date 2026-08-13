/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_destroy_uiwidget_allowed() {
  let widget_id = "fxms-bmb-button";

  CustomizableUI.createWidget({
    id: widget_id,
    label: "Test widget",
  });

  Assert.ok(
    CustomizableUI.getWidget(widget_id),
    "Widget was successfully created"
  );

  let widgetDestroyed = false;
  let listener = {
    onWidgetDestroyed() {
      widgetDestroyed = true;
    },
  };
  CustomizableUI.addListener(listener);

  await SMATestUtils.executeAndValidateAction({
    type: "DESTROY_UIWIDGET",
    data: {
      widget_id,
    },
  });

  CustomizableUI.removeListener(listener);

  Assert.ok(
    widgetDestroyed,
    "destroyWidget called when widget is in the allowlist"
  );
});

add_task(async function test_destroy_uiwidget_disallowed() {
  let widget_id = "unknown_button";

  CustomizableUI.createWidget({
    id: widget_id,
    label: "Test widget",
  });

  Assert.ok(
    CustomizableUI.getWidget(widget_id),
    "Widget was successfully created"
  );

  let widgetDestroyed = false;
  let listener = {
    onWidgetDestroyed() {
      widgetDestroyed = true;
    },
  };
  CustomizableUI.addListener(listener);

  await SMATestUtils.executeAndValidateAction({
    type: "DESTROY_UIWIDGET",
    data: {
      widget_id,
    },
  });

  CustomizableUI.removeListener(listener);

  Assert.ok(
    !widgetDestroyed,
    "destroyWidget not called when widget is not in the allowlist"
  );

  CustomizableUI.destroyWidget(widget_id);
});
