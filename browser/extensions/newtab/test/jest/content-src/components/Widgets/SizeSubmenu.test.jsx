/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { SizeSubmenu } from "content-src/components/Widgets/SizeSubmenu";

function renderSizeSubmenu(props = {}) {
  const { container } = render(
    <panel-list>
      <SizeSubmenu
        submenuId="test-size-submenu"
        sizes={["small", "medium", "large"]}
        checkedSize="medium"
        onChangeSize={() => {}}
        {...props}
      />
    </panel-list>
  );
  return { container };
}

describe("<SizeSubmenu>", () => {
  it("renders a Change size item whose submenu uses the given id", () => {
    const { container } = renderSizeSubmenu();
    const item = container.querySelector(
      "panel-item[submenu='test-size-submenu']"
    );
    expect(item).toBeInTheDocument();
    expect(
      item.querySelector("span[data-l10n-id='newtab-widget-menu-change-size']")
    ).toBeInTheDocument();
    expect(
      container.querySelector("panel-list[id='test-size-submenu']")
    ).toBeInTheDocument();
  });

  it("renders one item per size with the size-specific l10n id", () => {
    const { container } = renderSizeSubmenu();
    const sizeItems = container.querySelectorAll("panel-item[data-size]");
    expect(Array.from(sizeItems).map(i => i.getAttribute("data-size"))).toEqual(
      ["small", "medium", "large"]
    );
    expect(
      container
        .querySelector("panel-item[data-size='large']")
        .getAttribute("data-l10n-id")
    ).toBe("newtab-widget-size-large");
  });

  it("marks only the checkedSize as checked", () => {
    const { container } = renderSizeSubmenu({ checkedSize: "large" });
    expect(
      container
        .querySelector("panel-item[data-size='large']")
        .hasAttribute("checked")
    ).toBe(true);
    expect(
      container
        .querySelector("panel-item[data-size='small']")
        .hasAttribute("checked")
    ).toBe(false);
  });

  it("renders only the sizes it is given", () => {
    const { container } = renderSizeSubmenu({ sizes: ["medium", "large"] });
    expect(
      Array.from(container.querySelectorAll("panel-item[data-size]")).map(i =>
        i.getAttribute("data-size")
      )
    ).toEqual(["medium", "large"]);
    expect(
      container.querySelector("panel-item[data-size='small']")
    ).not.toBeInTheDocument();
  });
});
