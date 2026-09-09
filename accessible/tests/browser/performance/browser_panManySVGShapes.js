/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// XXX: We can consolidate this once bug 1930955 lands
// eslint-disable-next-line no-unused-vars
const perfMetadata = {
  owner: "Accessibility Team",
  name: "browser_panManySVGShapes.js",
  description:
    "Audit a11y performance when panning an SVG workspace containing 2000 transformed groups, each with an ARIA labelled path. Modelled on the Blockly workspace in bug 2059322.",
  options: {
    default: {
      extra_args: ["headless"],
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      perfherder: true,
      perfherder_metrics: [
        // Total time for the entire run (this probe is not process specific)
        { name: "A11Y_TotalTime", unit: "ms", shouldAlert: true },

        //////////////// PARENT PROCESS

        // Timing metrics
        { name: "A11Y_DoInitialUpdate_parent", unit: "ms", shouldAlert: false },
        {
          name: "A11Y_ProcessQueuedCacheUpdate_parent",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedNode_parent",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedAcc_parent",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_PruneOrInsertSubtree_parent",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ShutdownChildrenInSubtree_parent",
          unit: "ms",
          shouldAlert: false,
        },
        { name: "A11Y_ShowEvent_parent", unit: "ms", shouldAlert: false },
        { name: "A11Y_RecvCache_parent", unit: "ms", shouldAlert: false },
        {
          name: "A11Y_ProcessShowEvent_parent",
          unit: "ms",
          shouldAlert: false,
        },
        { name: "A11Y_CoalesceEvents_parent", unit: "ms", shouldAlert: false },
        {
          name: "A11Y_CoalesceMutationEvents_parent",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessHideEvent_parent",
          unit: "ms",
          shouldAlert: false,
        },
        { name: "A11Y_SendCache_parent", unit: "ms", shouldAlert: false },
        { name: "A11Y_WillRefresh_parent", unit: "ms", shouldAlert: false },
        {
          name: "A11Y_AccessibilityServiceInit_parent",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_PlatformShowHideEvent_parent",
          unit: "ms",
          shouldAlert: false,
        },
        // Occurrence metrics
        {
          name: "A11Y_DoInitialUpdate_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessQueuedCacheUpdate_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedNode_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedAcc_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_PruneOrInsertSubtree_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ShutdownChildrenInSubtree_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ShowEvent_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_RecvCache_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessShowEvent_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_CoalesceEvents_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_CoalesceMutationEvents_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessHideEvent_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_SendCache_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_WillRefresh_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_AccessibilityServiceInit_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_PlatformShowHideEvent_Count_parent",
          unit: "iterations",
          shouldAlert: false,
        },

        //////////////// CONTENT PROCESS

        // Timing metrics
        {
          name: "A11Y_DoInitialUpdate_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessQueuedCacheUpdate_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedNode_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedAcc_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_PruneOrInsertSubtree_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ShutdownChildrenInSubtree_content",
          unit: "ms",
          shouldAlert: false,
        },
        { name: "A11Y_ShowEvent_content", unit: "ms", shouldAlert: false },
        { name: "A11Y_RecvCache_content", unit: "ms", shouldAlert: false },
        {
          name: "A11Y_ProcessShowEvent_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_CoalesceEvents_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_CoalesceMutationEvents_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessHideEvent_content",
          unit: "ms",
          shouldAlert: false,
        },
        { name: "A11Y_SendCache_content", unit: "ms", shouldAlert: false },
        { name: "A11Y_WillRefresh_content", unit: "ms", shouldAlert: false },
        {
          name: "A11Y_AccessibilityServiceInit_content",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "A11Y_PlatformShowHideEvent_content",
          unit: "ms",
          shouldAlert: false,
        },
        // Occurrence metrics
        {
          name: "A11Y_DoInitialUpdate_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessQueuedCacheUpdate_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedNode_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ContentRemovedAcc_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_PruneOrInsertSubtree_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ShutdownChildrenInSubtree_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ShowEvent_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_RecvCache_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessShowEvent_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_CoalesceEvents_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_CoalesceMutationEvents_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_ProcessHideEvent_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_SendCache_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_WillRefresh_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_AccessibilityServiceInit_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
        {
          name: "A11Y_PlatformShowHideEvent_Count_content",
          unit: "iterations",
          shouldAlert: false,
        },
      ],
      try_platform: ["linux", "mac", "win"],
      verbose: true,
    },
  },
};

const NAMESPACE_URI = "http://www.w3.org/2000/svg";
const NUM_SHAPES = 2000;
const NUM_PAN_STEPS = 20;
// We try to distribute the shapes evenly throughout the "workspace" so each
// pan causes the same number of new shapes to be painted.
const SHAPES_PER_ROW = 40;
const COLUMN_WIDTH = 15;
const ROW_HEIGHT = 8;
// This is the path describing a 10x5 rectangle
const SHAPE_PATH = "M0 0h10v5h-10z";

addAccessibleTask(
  `<svg id="workspace" width="600" height="400" viewBox="0 0 600 400"
        style="display:none;">
     <g id="canvas"></g>
   </svg>`,
  async function testPanManySVGShapes(browser) {
    info(`Adding ${NUM_SHAPES} shapes to the workspace`);
    const workspaceShown = waitForEvent(EVENT_SHOW, "workspace");
    // We populate the workspace while it is hidden so that we get a single show
    // event rather than one per shape. This keeps the cost of the show events
    // out of the panning measurement below.
    await invokeContentTask(
      browser,
      [
        NAMESPACE_URI,
        NUM_SHAPES,
        SHAPES_PER_ROW,
        COLUMN_WIDTH,
        ROW_HEIGHT,
        SHAPE_PATH,
      ],
      (namespaceURI, numShapes, shapesPerRow, columnWidth, rowHeight, path) => {
        const canvas = content.document.getElementById("canvas");
        for (let i = 0; i < numShapes; i++) {
          const group = content.document.createElementNS(namespaceURI, "g");
          // Lay the shapes out in a grid, left to right, top to bottom.
          const x = (i % shapesPerRow) * columnWidth;
          const y = Math.floor(i / shapesPerRow) * rowHeight;
          group.setAttribute("transform", `translate(${x}, ${y})`);
          const shape = content.document.createElementNS(namespaceURI, "path");
          shape.setAttribute("d", path);
          // This ensures each element gets an accessible
          shape.setAttribute("aria-label", `block ${i}`);
          group.append(shape);
          canvas.append(group);
        }
        content.document
          .getElementById("workspace")
          .style.removeProperty("display");
      }
    );
    info("Waiting for the workspace's show event");
    await workspaceShown;

    await timeThis(async () => {
      info(`Panning the workspace ${NUM_PAN_STEPS} times`);
      for (let step = 0; step < NUM_PAN_STEPS; step++) {
        await invokeContentTask(browser, [step], panStep => {
          const canvas = content.document.getElementById("canvas");
          // On each pan, translate the canvas so new shapes are in view
          canvas.setAttribute("transform", `translate(${panStep}, ${panStep})`);
        });
        // Each pan will generate a repaint. Wait for that paint to finish
        // before we pan again.
        await waitForContentPaint(browser);
      }
    });
  }
);
