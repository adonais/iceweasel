import { render } from "@testing-library/react";
import { DownloadModalToggle } from "content-src/components/DownloadModalToggle/DownloadModalToggle";

describe("<DownloadModalToggle>", () => {
  let container;

  beforeEach(() => {
    ({ container } = render(<DownloadModalToggle />));
  });

  it("should render", () => {
    expect(container.firstChild).toBeInTheDocument();
    expect(
      container.querySelector(".mobile-download-promo")
    ).toBeInTheDocument();
  });
});
