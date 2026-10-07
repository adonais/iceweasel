import { fireEvent, render } from "@testing-library/react";
import { TopSiteFormInput } from "content-src/components/TopSites/TopSiteFormInput";

describe("<TopSiteFormInput>", () => {
  it("should render", () => {
    const { container } = render(
      <TopSiteFormInput
        onChange={jest.fn()}
        titleId="newtab-topsites-title-label"
      />
    );
    expect(container.querySelector("label")).toBeInTheDocument();
  });
});

describe("#TopSiteFormInput", () => {
  describe("no errors", () => {
    let onChangeStub;

    const renderInput = (extraProps = {}) =>
      render(
        <TopSiteFormInput
          titleId="newtab-topsites-title-label"
          placeholderId="newtab-topsites-title-input"
          errorMessageId="newtab-topsites-url-validation"
          onChange={onChangeStub}
          value="foo"
          {...extraProps}
        />
      );

    beforeEach(() => {
      onChangeStub = jest.fn();
    });

    it("should render the provided title", () => {
      const { container } = renderInput();
      const title = container.querySelector("span");

      expect(title).toHaveAttribute(
        "data-l10n-id",
        "newtab-topsites-title-label"
      );
    });

    it("should render the provided value", () => {
      const { container } = renderInput();
      const input = container.querySelector("input");

      expect(input.value).toBe("foo");
    });

    it("should render the clear button if cb is provided", () => {
      const { container, rerender } = renderInput();

      expect(
        container.querySelector(".icon-clear-input")
      ).not.toBeInTheDocument();

      rerender(
        <TopSiteFormInput
          titleId="newtab-topsites-title-label"
          placeholderId="newtab-topsites-title-input"
          errorMessageId="newtab-topsites-url-validation"
          onChange={onChangeStub}
          value="foo"
          onClear={jest.fn()}
        />
      );

      expect(container.querySelector(".icon-clear-input")).toBeInTheDocument();
    });

    it("should show the loading indicator", () => {
      const { container, rerender } = renderInput();

      expect(
        container.querySelector(".loading-container")
      ).not.toBeInTheDocument();

      rerender(
        <TopSiteFormInput
          titleId="newtab-topsites-title-label"
          placeholderId="newtab-topsites-title-input"
          errorMessageId="newtab-topsites-url-validation"
          onChange={onChangeStub}
          value="foo"
          loading={true}
        />
      );

      expect(container.querySelector(".loading-container")).toBeInTheDocument();
    });

    it("should disable the input when loading indicator is present", () => {
      const { container, rerender } = renderInput();

      expect(container.querySelector("input").disabled).toBe(false);

      rerender(
        <TopSiteFormInput
          titleId="newtab-topsites-title-label"
          placeholderId="newtab-topsites-title-input"
          errorMessageId="newtab-topsites-url-validation"
          onChange={onChangeStub}
          value="foo"
          loading={true}
        />
      );

      expect(container.querySelector("input").disabled).toBe(true);
    });
  });

  describe("with error", () => {
    let onChangeStub;

    const renderInput = () =>
      render(
        <TopSiteFormInput
          titleId="newtab-topsites-title-label"
          placeholderId="newtab-topsites-title-input"
          onChange={onChangeStub}
          validationError={true}
          errorMessageId="newtab-topsites-url-validation"
          value="foo"
        />
      );

    beforeEach(() => {
      onChangeStub = jest.fn();
    });

    it("should render the error message", () => {
      const { container } = renderInput();

      expect(
        container.querySelector(
          '[data-l10n-id="newtab-topsites-url-validation"]'
        )
      ).toBeInTheDocument();
    });

    it("should reset the error state on value change", () => {
      const { container } = renderInput();

      fireEvent.change(container.querySelector("input"), {
        target: { value: "bar" },
      });

      expect(
        container.querySelector(
          '[data-l10n-id="newtab-topsites-url-validation"]'
        )
      ).not.toBeInTheDocument();
    });
  });
});
