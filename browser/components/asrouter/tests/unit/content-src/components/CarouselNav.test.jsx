/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import React from "react";
import { shallow } from "enzyme";
import { CarouselNav } from "content-src/components/CarouselNav";

describe("CarouselNav component", () => {
  const ITEMS = [
    {
      id: "one",
      pill: { label: { raw: "One" }, icon: "chrome://browser/skin/tabs.svg" },
    },
    { id: "two", pill: { label: { string_id: "pill-two" } } },
    { id: "no-pill" },
  ];

  const makeWrapper = (props = {}) =>
    shallow(<CarouselNav items={ITEMS} activeId="one" {...props} />);

  it("should render one pill per item with a pill property", () => {
    const pills = makeWrapper().find("moz-segmented-control-item");
    assert.equal(pills.length, 2);
    assert.deepEqual(
      pills.map(p => p.prop("value")),
      ["one", "two"]
    );
  });

  it("should not render with fewer than two pills", () => {
    assert.isTrue(makeWrapper({ items: [ITEMS[0]] }).isEmptyRender());
    assert.isTrue(makeWrapper({ items: [] }).isEmptyRender());
  });

  it("should map raw labels to the label attribute", () => {
    const pill = makeWrapper().find('moz-segmented-control-item[value="one"]');
    assert.equal(pill.prop("label"), "One");
    assert.isUndefined(pill.prop("data-l10n-id"));
  });

  it("should map string_id labels to data-l10n-id", () => {
    const pill = makeWrapper().find('moz-segmented-control-item[value="two"]');
    assert.equal(pill.prop("data-l10n-id"), "pill-two");
    assert.isUndefined(pill.prop("label"));
  });

  it("should map pill.icon to iconsrc", () => {
    assert.equal(
      makeWrapper()
        .find('moz-segmented-control-item[value="one"]')
        .prop("iconsrc"),
      "chrome://browser/skin/tabs.svg"
    );
  });

  it("should reflect activeId as the group value", () => {
    assert.equal(
      makeWrapper({ activeId: "two" })
        .find("moz-segmented-control")
        .prop("value"),
      "two"
    );
  });

  it("should use a default accessible name, overridden by navLabel", () => {
    assert.equal(
      makeWrapper().find("moz-segmented-control").prop("data-l10n-id"),
      "onboarding-carousel-nav"
    );
    assert.equal(
      makeWrapper({ navLabel: { raw: "Highlights" } })
        .find("moz-segmented-control")
        .prop("aria-label"),
      "Highlights"
    );
  });
});
