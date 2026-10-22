/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRef } from "react";
import { render } from "@testing-library/react";
import { WidgetMenuButton } from "content-src/components/Widgets/WidgetMenuButton";

describe("<WidgetMenuButton>", () => {
  it("renders a small ghost more button wired to its menu", () => {
    const ref = createRef();
    const { container } = render(
      <WidgetMenuButton
        className="clocks-context-menu-button"
        menuId="clocks-widget-context-menu"
        l10nId="newtab-clock-widget-open-menu-button"
        ref={ref}
      />
    );
    const button = container.querySelector("moz-button");

    expect(button).toHaveClass("clocks-context-menu-button");
    expect(button.getAttribute("size")).toBe("small");
    expect(button.getAttribute("type")).toBe("ghost");
    expect(button.getAttribute("iconSrc")).toBe(
      "chrome://global/skin/icons/more.svg"
    );
    expect(button.getAttribute("data-l10n-id")).toBe(
      "newtab-clock-widget-open-menu-button"
    );
    expect(button.getAttribute("menuId")).toBe("clocks-widget-context-menu");
    expect(ref.current).toBe(button);
  });
});
