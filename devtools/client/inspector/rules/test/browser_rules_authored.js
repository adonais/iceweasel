/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test for as-authored styles.

add_task(async function () {
  const html = `
    <style type="text/css">
      #testid {
        /* Invalid property */
        something: random;
        /* Invalid values */
        color: orang;
        -a: red;
        --b: var(-a);
        /* Override */
        background-color: blue;
        background-color: #f06;
      }
      </style>
      <div id="testid" class="testclass">Styled Node</div>`;
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(html));

  const { inspector, view } = await openRuleView();
  await selectNode("#testid", inspector);

  await checkRuleViewContent(view, [
    {
      selector: "element",
      selectorEditable: false,
      declarations: [],
    },
    {
      selector: "#testid",
      declarations: [
        {
          name: "something",
          value: "random",
          valid: false,
        },
        { name: "color", value: "orang", valid: false },
        { name: "-a", value: "red", valid: false },
        { name: "--b", value: "var(-a)", valid: false },
        {
          name: "background-color",
          value: "blue",
          overridden: true,
        },
        {
          name: "background-color",
          value: "#f06",
        },
      ],
    },
  ]);
});
