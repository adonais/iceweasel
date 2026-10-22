/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
/* import-globals-from helper_inplace_editor.js */

"use strict";

const AutocompletePopup = require("resource://devtools/client/shared/autocomplete-popup.js");
const {
  InplaceEditor,
} = require("resource://devtools/client/shared/inplace-editor.js");
loadHelperScript("helper_inplace_editor.js");

const RANDOM_KEYWORDS = [
  "auto",
  "element-scoped",
  "fixed",
  "property-index-scoped",
  "property-scoped",
];

add_task(async function testAutocompleteRandomFunction() {
  await pushPref("layout.css.random.enabled", true);

  await addTab(
    "data:text/html;charset=utf-8,inplace editor CSS random() autocomplete"
  );
  const { host, doc } = await createHost();

  await checkAutocomplete({
    doc,
    initialText: "random(",
    inputValueAfterSuggest: "random(auto",
    popupItems: RANDOM_KEYWORDS,
  });

  await checkAutocomplete({
    doc,
    initialText: "random(prop",
    inputValueAfterSuggest: "random(property-index-scoped",
    popupItems: ["property-index-scoped", "property-scoped"],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(--foo ",
    inputValueAfterSuggest: "random(--foo element-scoped",
    popupItems: ["element-scoped", "property-index-scoped", "property-scoped"],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(element-scoped ",
    inputValueAfterSuggest: "random(element-scoped property-index-scoped",
    popupItems: ["property-index-scoped", "property-scoped"],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(property-scoped ",
    inputValueAfterSuggest: "random(property-scoped element-scoped",
    popupItems: [],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(property-index-scoped ",
    inputValueAfterSuggest: "random(property-index-scoped element-scoped",
    popupItems: [],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(element-scoped property-scoped ",
    inputValueAfterSuggest: "random(element-scoped property-scoped ",
    popupItems: [],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(auto, ",
    inputValueAfterSuggest: "random(auto, ",
    popupItems: [],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(0px, ",
    inputValueAfterSuggest: "random(0px, ",
    popupItems: [],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(f",
    inputValueAfterSuggest: "random(fixed",
    popupItems: [],
  });

  await checkAutocomplete({
    doc,
    initialText: "random(fixed ",
    inputValueAfterSuggest: "random(fixed ",
    popupItems: [],
  });

  host.destroy();
  gBrowser.removeCurrentTab();
});

async function checkAutocomplete({
  doc,
  initialText,
  inputValueAfterSuggest,
  popupItems,
}) {
  const popup = new AutocompletePopup(doc, { autoSelect: true });

  await new Promise(resolve => {
    createInplaceEditorAndClick(
      {
        initial: initialText,
        start: async editor => {
          const global = editor.input.defaultView;

          EventUtils.synthesizeKey("VK_RIGHT", {}, global);

          await testCompletion(
            [
              { key: " ", ctrlKey: true },
              inputValueAfterSuggest,
              popupItems.length ? 0 : -1,
              popupItems,
            ],
            editor
          );

          EventUtils.synthesizeKey("VK_RETURN", {}, global);
        },
        contentType: InplaceEditor.CONTENT_TYPES.CSS_VALUE,
        property: { name: "width" },
        done: resolve,
        popup,
      },
      doc
    );
  });

  popup.destroy();
}
