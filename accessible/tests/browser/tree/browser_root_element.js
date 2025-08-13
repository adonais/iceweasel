/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../mochitest/role.js */
loadScripts({ name: "role.js", dir: MOCHITESTS_DIR });

/**
 * Verify that we don't mutate the accessible tree when the the root
 * element gets a new overflow style.
 */
addAccessibleTask(
  `
<button>button</button>
  `,
  async function testNoMutateOnRootOverflow(browser, accDoc) {
    const tree = {
      DOCUMENT: [
        {
          // Body element gets a generic container.
          TEXT_CONTAINER: [
            {
              PUSHBUTTON: [{ TEXT_LEAF: [] }],
            },
          ],
        },
      ],
    };
    testAccessibleTree(accDoc, tree);
    await contentSpawnMutation(
      browser,
      { unexpected: [[EVENT_REORDER, accDoc]] },
      function () {
        content.document.documentElement.style.overflow = "hidden";
      }
    );
  },
  {
    contentDocBodyAttrs: { style: "overflow: auto;" },
  }
);
