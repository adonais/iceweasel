import { render, fireEvent } from "@testing-library/react";
import { actionTypes as at } from "common/Actions.mjs";
import { ThemesManagementPanel } from "content-src/components/CustomizeMenu/ThemesManagementPanel/ThemesManagementPanel";
import { WrapWithProvider } from "test/jest/test-utils";

const mockDispatch = jest.fn();
jest.mock("react-redux", () => ({
  ...jest.requireActual("react-redux"),
  useDispatch: () => mockDispatch,
}));

const DEFAULT_PROPS = {
  togglePanel: () => {},
  onSubpanelToggle: () => {},
};

describe("<ThemesManagementPanel>", () => {
  beforeEach(() => mockDispatch.mockClear());

  it("renders the 'See more themes' entry button and no panel when closed", () => {
    const { container } = render(
      <WrapWithProvider>
        <ThemesManagementPanel {...DEFAULT_PROPS} showPanel={false} />
      </WrapWithProvider>
    );
    expect(container.querySelector("moz-box-button")).toBeInTheDocument();
    expect(container.querySelector("theme-picker")).not.toBeInTheDocument();
  });

  it("renders the full theme-picker and an about:addons text link when open", () => {
    const { container } = render(
      <WrapWithProvider>
        <ThemesManagementPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );
    const picker = container.querySelector("theme-picker");
    expect(picker).toBeInTheDocument();
    expect(picker).toHaveAttribute("layout", "full");

    const link = container.querySelector("button.external-link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "data-l10n-id",
      "newtab-appearance-explore-more-themes-button"
    );
  });

  it("dispatches OPEN_ABOUT_ADDONS_THEMES when 'Explore more themes' is clicked", () => {
    const { container } = render(
      <WrapWithProvider>
        <ThemesManagementPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector("button.external-link"));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: at.OPEN_ABOUT_ADDONS_THEMES })
    );
  });
});
