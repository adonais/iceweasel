/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { componentTypeName } = ChromeUtils.importESModule(
  "chrome://browser/content/aiwindow/modules/AITabUtils.mjs"
);

add_task(function test_component_type_name() {
  Assert.equal(
    componentTypeName({ component: "Header" }),
    "Header",
    "A component without a layout is its catalog name"
  );
  Assert.equal(
    componentTypeName({ component: "List", layout: "column" }),
    "List_column",
    "A string layout is appended"
  );
  Assert.equal(
    componentTypeName({ component: "List", layout: 1 }),
    "List",
    "A non-string layout is ignored"
  );
  Assert.equal(componentTypeName(), undefined, "No component has no name");
});
