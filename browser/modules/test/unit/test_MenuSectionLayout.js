/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// MenuSectionLayout operates on generic DOM, so the tests build their own
// throwaway elements in an HTML data document and never touch the real tab
// context menu or any browser-specific markup.
const { MenuSectionLayout } = ChromeUtils.importESModule(
  "resource:///modules/MenuSectionLayout.sys.mjs"
);

function makeDoc() {
  return new DOMParser().parseFromString(
    "<!DOCTYPE html><html><body></body></html>",
    "text/html"
  );
}

function makeItem(doc, spec) {
  let { id, className } = typeof spec === "string" ? { id: spec } : spec;
  let el = doc.createElement("div");
  if (id) {
    el.id = id;
  }
  if (className) {
    el.className = className;
  }
  return el;
}

// Create a container element with `id`, populate it with child items (each a
// bare id string or a {id, className} spec), and attach it to the document.
function makePopup(doc, id, children = []) {
  let popup = makeItem(doc, id);
  for (let child of children) {
    popup.appendChild(makeItem(doc, child));
  }
  doc.body.appendChild(popup);
  return popup;
}

function childIds(popup) {
  return Array.from(popup.children, c => c.id);
}

add_task(function test_reorders_children() {
  let doc = makeDoc();
  let popup = makePopup(doc, "root", ["a", "b", "c"]);
  new MenuSectionLayout({
    root: [{ name: "s", items: ["#c", "#a", "#b"] }],
  }).arrange(popup);
  Assert.deepEqual(
    childIds(popup),
    ["c", "a", "b"],
    "reordered to declared order"
  );
});

add_task(function test_twin_array_order() {
  let doc = makeDoc();
  let popup = makePopup(doc, "root", ["a", "b", "c"]);
  new MenuSectionLayout({
    root: [{ name: "s", items: [["#b", "#c"], "#a"] }],
  }).arrange(popup);
  Assert.deepEqual(
    childIds(popup),
    ["b", "c", "a"],
    "twin members stay contiguous and in order"
  );
});

add_task(function test_optional_present_and_absent() {
  let doc = makeDoc();
  // Optional item absent: skipped, no throw.
  let popup = makePopup(doc, "root", ["a", "b"]);
  new MenuSectionLayout({
    root: [
      { name: "s", items: ["#a", { selector: "#x", optional: true }, "#b"] },
    ],
  }).arrange(popup);
  Assert.deepEqual(
    childIds(popup),
    ["a", "b"],
    "absent optional item is skipped"
  );

  // Optional item present: placed in its slot.
  let doc2 = makeDoc();
  let popup2 = makePopup(doc2, "root", ["a", "x", "b"]);
  new MenuSectionLayout({
    root: [
      { name: "s", items: ["#a", { selector: "#x", optional: true }, "#b"] },
    ],
  }).arrange(popup2);
  Assert.deepEqual(
    childIds(popup2),
    ["a", "x", "b"],
    "present optional item is placed"
  );
});

add_task(function test_dynamic_items_exempt() {
  let doc = makeDoc();
  let popup = makePopup(doc, "root", [
    "a",
    "b",
    { id: "d1", className: "dyn" },
  ]);

  // Without the dynamic selector, an unplaced child should cause a test failure
  Assert.throws(
    () =>
      new MenuSectionLayout({
        root: [{ name: "s", items: ["#a", "#b"] }],
      }).arrange(popup),
    /not placed by any section/,
    "unexpected child throws"
  );

  // With the dynamic selector it is exempt and kept (trailing).
  new MenuSectionLayout(
    { root: [{ name: "s", items: ["#a", "#b"] }] },
    { dynamicItemSelectors: [".dyn"] }
  ).arrange(popup);
  Assert.deepEqual(
    childIds(popup),
    ["a", "b", "d1"],
    "dynamic child exempt and left in place"
  );
});

add_task(function test_open_section_allows_trailing_only() {
  let doc = makeDoc();
  // External items after the last placed item are allowed by an open section,
  // and the declared items are committed ahead of them.
  let popup = makePopup(doc, "root", ["a", "b", "ext1", "ext2"]);
  new MenuSectionLayout({
    root: [
      { name: "s", items: ["#b", "#a"] },
      { name: "x", open: true, items: [] },
    ],
  }).arrange(popup);
  Assert.deepEqual(
    childIds(popup),
    ["b", "a", "ext1", "ext2"],
    "managed first, external trails"
  );

  // An unmanaged item *before* the last placed item still fails loudly.
  let doc2 = makeDoc();
  let popup2 = makePopup(doc2, "root", ["a", "mid", "b"]);
  Assert.throws(
    () =>
      new MenuSectionLayout({
        root: [
          { name: "s", items: ["#a", "#b"] },
          { name: "x", open: true, items: [] },
        ],
      }).arrange(popup2),
    /not placed by any section/,
    "non-trailing unmanaged item is not exempted by an open section"
  );
});

add_task(function test_cross_popup_relocation_and_reversal() {
  let doc = makeDoc();
  let root = makePopup(doc, "root", ["x"]);
  let sub = makePopup(doc, "sub", []);
  root.appendChild(sub); // sub is a nested popup under root

  // Move x out of root and into sub.
  new MenuSectionLayout({
    root: [{ name: "s", items: ["#sub"] }],
    sub: [{ name: "s", items: ["#x"] }],
  }).arrange(root);
  Assert.deepEqual(childIds(root), ["sub"], "x relocated out of root");
  Assert.deepEqual(childIds(sub), ["x"], "x relocated into sub");

  // Applying the inverse layout restores x to root.
  new MenuSectionLayout({
    root: [{ name: "s", items: ["#x", "#sub"] }],
    sub: [{ name: "s", items: [] }],
  }).arrange(root);
  Assert.deepEqual(childIds(root), ["x", "sub"], "x restored to root");
  Assert.deepEqual(childIds(sub), [], "sub emptied");
});

add_task(function test_throws() {
  let doc = makeDoc();

  // Required selector matching nothing.
  let popup = makePopup(doc, "root", ["a"]);
  Assert.throws(
    () =>
      new MenuSectionLayout({
        root: [{ name: "s", items: ["#a", "#missing"] }],
      }).arrange(popup),
    /no unclaimed node matching/,
    "missing required selector throws"
  );

  // Selector matching more than one node.
  let doc2 = makeDoc();
  let popup2 = makePopup(doc2, "root", [
    { id: "t1", className: "twin" },
    { id: "t2", className: "twin" },
  ]);
  Assert.throws(
    () =>
      new MenuSectionLayout({
        root: [{ name: "s", items: [".twin"] }],
      }).arrange(popup2),
    /selectors must be unique/,
    "ambiguous selector throws"
  );

  // Missing rootPopup.
  Assert.throws(
    () => new MenuSectionLayout({ root: [] }).arrange(null),
    /rootPopup is required/,
    "null rootPopup throws"
  );
});
