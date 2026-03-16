/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { Logo } from "content-src/components/Logo/Logo";

describe("<Logo>", () => {
  it("should render a logo and wordmark element", () => {
    const { container } = render(<Logo />);
    expect(
      container.querySelector(".logo-and-wordmark .logo")
    ).toBeInTheDocument();
    expect(
      container.querySelector(".logo-and-wordmark .wordmark")
    ).toBeInTheDocument();
  });
});
