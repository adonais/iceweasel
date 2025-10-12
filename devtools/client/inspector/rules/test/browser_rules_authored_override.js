/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test for as-authored styles.

add_task(async function () {
  const gradientText1 = "(orange, blue);";
  const gradientText2 = "(pink, teal);";
  const html = `
    <style type="text/css">
      #testid {
        background-image: linear-gradient${gradientText1};
        background-image: -ms-linear-gradient${gradientText2};
        background-image: linear-gradient${gradientText2};
      }
    </style>
    <div id="testid" class="testclass">Styled Node</div>`;
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(html));

  const { inspector, view } = await openRuleView();
  await selectNode("#testid", inspector);

  const elementStyle = view._elementStyle;
  const rule = elementStyle.rules[1];

  for (let i = 0; i < 3; ++i) {
    const prop = rule.textProps[i];
    is(prop.name, "background-image", "check the property name");
    // Initially only the first property is overridden.
    is(prop.overridden, i === 0, `check overridden for property #${i}`);
    // and the second one should be invalid
    is(prop.editor.isValid(), i !== 1, `check validity for property #${i}`);
  }

  await togglePropStatus(view, rule.textProps[2]);

  for (let i = 0; i < 3; ++i) {
    const prop = rule.textProps[i];

    // Now the last property shouldn't be enabled anymore
    is(prop.enabled, i !== 2, `post-change check enabled for ${i}`);

    // and as a result, the first property should be active, so no properties are overridden
    is(prop.overridden, false, `post-change check not overridden for ${i}`);

    // and the second property should still be invalid
    is(
      prop.editor.isValid(),
      i !== 1,
      "post-change check validity for property #" + i
    );
  }
});
