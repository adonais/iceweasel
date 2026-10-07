import { render } from "@testing-library/react";
import { SectionTitle } from "content-src/components/DiscoveryStreamComponents/SectionTitle/SectionTitle";

describe("<SectionTitle>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = render(<SectionTitle header={{}} />);
  });

  it("should render", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(".ds-section-title")
    ).toBeInTheDocument();
  });

  it("should render a subtitle", () => {
    wrapper.rerender(
      <SectionTitle header={{ title: "Foo", subtitle: "Bar" }} />
    );

    expect(wrapper.container.querySelector(".subtitle")).toHaveTextContent(
      "Bar"
    );
  });
});
