import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { Search } from "content-src/components/Search/Search";

describe("<Search>", () => {
  function renderSearch(props = {}) {
    return render(
      <WrapWithProvider>
        <Search dispatch={jest.fn()} {...props} />
      </WrapWithProvider>
    );
  }

  it("should render a Search element", () => {
    const { container } = renderSearch();
    expect(container.querySelector(".search-wrapper")).toBeInTheDocument();
  });

  it("should not use a <form> element", () => {
    const { container } = renderSearch();
    expect(container.querySelector("form")).not.toBeInTheDocument();
  });

  it("should show our logo when the prop exists.", () => {
    const { container } = renderSearch({ showLogo: true });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).toBeInTheDocument();
  });

  it("should not show our logo when the prop does not exist.", () => {
    const { container } = renderSearch({ showLogo: false });
    expect(
      container.querySelector(".logo-and-wordmark-wrapper")
    ).not.toBeInTheDocument();
  });

  describe("Search Hand-off", () => {
    it("should render a Search hand-off element", () => {
      const { container } = renderSearch();
      const externalComponentWrappers = container.querySelectorAll(
        ".search-inner-wrapper"
      );
      expect(externalComponentWrappers).toHaveLength(1);
    });
  });
});
