/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { PanelListItems } from "content-src/components/LinkMenu/PanelListItems";

// PanelListItems consumes already-built LinkMenuOptions entries; the
// option-building logic (getLinkMenuOptions) is covered by LinkMenu.test.jsx.
describe("PanelListItems", () => {
  it("renders a panel-item per non-separator, non-empty option", () => {
    const { container } = render(
      <PanelListItems
        options={[
          { id: "a", onClick: () => {} },
          { id: "b", onClick: () => {} },
        ]}
      />
    );
    expect(container.querySelectorAll("panel-item")).toHaveLength(2);
    expect(container.querySelector("hr")).toBeNull();
  });

  it("renders a separator option as an hr", () => {
    const { container } = render(
      <PanelListItems
        options={[{ id: "a" }, { type: "separator" }, { id: "b" }]}
      />
    );
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    expect(container.querySelectorAll("panel-item")).toHaveLength(2);
  });

  it("does not render empty options", () => {
    const { container } = render(
      <PanelListItems options={[{ id: "a" }, { type: "empty" }]} />
    );
    expect(container.querySelectorAll("panel-item")).toHaveLength(1);
  });

  it("marks disabled options with the disabled attribute", () => {
    const { container } = render(
      <PanelListItems options={[{ id: "a", disabled: true }]} />
    );
    expect(container.querySelector("panel-item")).toHaveAttribute("disabled");
  });

  it("labels the item with string_id, falling back to id", () => {
    const { container } = render(
      <PanelListItems
        options={[{ id: "fallback-id" }, { id: "x", string_id: "explicit-id" }]}
      />
    );
    const spans = container.querySelectorAll("span");
    expect(spans[0]).toHaveAttribute("data-l10n-id", "fallback-id");
    expect(spans[1]).toHaveAttribute("data-l10n-id", "explicit-id");
  });
});
