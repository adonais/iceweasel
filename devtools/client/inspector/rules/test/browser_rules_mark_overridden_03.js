/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that the rule view marks overridden rules correctly based on the
// priority for the rule

const TEST_URI = `
  <style type='text/css'>
  #testid {
    background-color: blue;
    color: gold;
  }
  .testclass {
    background-color: green !important;
    color: tomato !IMPORTANT;
  }
  </style>
  <div id='testid' class='testclass'>Styled Node</div>
`;

add_task(async function () {
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));
  const { inspector, view } = await openRuleView();
  await selectNode("#testid", inspector);

  await checkRuleViewContent(view, [
    {
      selector: `element`,
      selectorEditable: false,
      declarations: [],
    },
    {
      selector: `#testid`,
      declarations: [
        {
          name: "background-color",
          value: "blue",
          // Not-important declaration is overriden
          overridden: true,
        },
        {
          name: "color",
          value: "gold",
          // Not-important declaration is overriden by uppercase !IMPORTANT
          overridden: true,
        },
      ],
    },
    {
      selector: `.testclass`,
      declarations: [
        {
          name: "background-color",
          value: "green !important",
          overridden: false,
        },
        {
          name: "color",
          value: "tomato !important",
          overridden: false,
        },
      ],
    },
  ]);
});
