import { render } from "@testing-library/react";
import { PrivacyLink } from "content-src/components/DiscoveryStreamComponents/PrivacyLink/PrivacyLink";

describe("<PrivacyLink>", () => {
  let container;

  beforeEach(() => {
    ({ container } = render(
      <PrivacyLink
        properties={{
          url: "url",
          title: "Privacy Link",
        }}
      />
    ));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render", () => {
    expect(container.firstChild).toBeInTheDocument();
    expect(container.querySelector(".ds-privacy-link")).toBeInTheDocument();
  });
});
