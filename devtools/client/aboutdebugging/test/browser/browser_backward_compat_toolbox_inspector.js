/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

// Check the Inspector against a remote target: the markup view is not blank and
// selecting another element updates the computed view. This mirrors the
// Inspector part of the "Inspect a remote target" step of the manual smoke
// test, see devtools/docs/contributor/release.md.
addCompatTask(async function (config) {
  const setup = await openCompatToolbox(config, "debugger.html");
  const { toolbox } = setup;

  info("Select the inspector");
  const inspector = await toolbox.selectTool("inspector");

  info("Check that the markup view is not blank");
  const markupDoc = inspector.markup.doc;

  info("Wait until tags are rendered in the markup view");
  await waitFor(
    () => !!markupDoc.querySelector(".tag-line"),
    "Tags should be rendered in the markup view"
  );
  ok(
    markupDoc.body.textContent.includes("click-me"),
    "The markup view displays the content of the remote page"
  );

  info("Select the computed view");
  await inspector.sidebar.select("computedview");
  const computedView = inspector.getPanel("computedview").computedView;

  info("Include browser styles in the computed view");
  const onBrowserStyles = inspector.once("computed-view-refreshed");
  computedView.includeBrowserStylesCheckbox.click();
  await onBrowserStyles;

  await selectNodeOnRemoteTarget(inspector, "h1#title");

  info("Check that the computed view is not blank");
  const computedDoc = computedView.styleDocument;

  info("Wait until computed values are rendered in the computed view");
  await waitFor(
    () =>
      computedDoc.querySelector(
        ".computed-property-view .computed-property-value"
      ),
    "Computed values should be rendered in the computed view"
  );
  const titleProperties = getComputedProperties(computedView);
  is(titleProperties.get("display"), "block", "h1#title is displayed as block");

  await selectNodeOnRemoteTarget(inspector, "button#click-me");

  await waitFor(() => {
    const properties = getComputedProperties(computedView);
    return properties.get("display") === "inline-block";
  }, "Selecting another element updated the computed view");

  await closeCompatToolbox(config, setup);
});

/**
 * Select the node matching the provided selector on the remote target, and wait
 * until the computed view has been refreshed for it.
 */
async function selectNodeOnRemoteTarget(inspector, selector) {
  info(`Select ${selector} in the markup view`);
  const nodeFront = await inspector.walker.querySelector(
    inspector.walker.rootNode,
    selector
  );
  ok(nodeFront, `Found ${selector} on the remote target`);

  const onRefreshed = inspector.once("computed-view-refreshed");
  inspector.selection.setNodeFront(nodeFront, { reason: "test" });
  await onRefreshed;
}

/**
 * Map of property name to computed value, as held by the computed view for the
 * currently selected node. Read from the property views rather than the DOM,
 * because the computed view only renders the rows which are currently visible.
 */
function getComputedProperties(computedView) {
  return new Map(
    computedView.propertyViews.map(propertyView => [
      propertyView.name,
      propertyView.value,
    ])
  );
}
