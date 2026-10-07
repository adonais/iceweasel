import { render } from "@testing-library/react";
import { HorizontalRule } from "content-src/components/DiscoveryStreamComponents/HorizontalRule/HorizontalRule";

describe("<HorizontalRule>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = render(<HorizontalRule />);
  });

  it("should render", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
    expect(wrapper.container.querySelector(".ds-hr")).toBeInTheDocument();
  });
});
