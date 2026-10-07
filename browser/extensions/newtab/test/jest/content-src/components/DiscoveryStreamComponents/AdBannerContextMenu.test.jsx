import { fireEvent, render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { AdBannerContextMenu } from "content-src/components/DiscoveryStreamComponents/AdBannerContextMenu/AdBannerContextMenu";

describe("<AdBannerContextMenu>", () => {
  let container;

  describe("Ad banner context menu options", () => {
    const props = {
      spoc: { url: "https://www.test.com/", shim: "aaabbbcccddd" },
      position: 1,
      type: "billboard",
      prefs: {},
    };

    // Mirrors the legacy mountWithProps(): the component's panel-list subtree
    // needs a redux Provider.
    function renderMenu(extra = {}) {
      return render(
        <WrapWithProvider>
          <AdBannerContextMenu dispatch={jest.fn()} {...props} {...extra} />
        </WrapWithProvider>
      );
    }

    beforeEach(() => {
      ({ container } = renderMenu());
    });

    it("should render a context menu button", () => {
      expect(container.querySelector("moz-button")).toBeInTheDocument();
      // Make sure the menu wrapper has the correct default styles
      expect(container.querySelector("div.ads-context-menu")).not.toHaveClass(
        "context-menu-open"
      );
    });
    it("should pair the moz-button and panel-list via menuId", () => {
      const button = container.querySelector("moz-button");
      const panelList = container.querySelector("panel-list");
      expect(panelList).toBeInTheDocument();
      expect(button.getAttribute("menuId")).toBe(panelList.getAttribute("id"));
    });
    it("should add hover/active styles when the panel-list fires 'shown'", () => {
      const panelList = container.querySelector("panel-list");
      fireEvent(panelList, new CustomEvent("shown"));
      expect(container.querySelector("div.ads-context-menu")).toHaveClass(
        "context-menu-open"
      );
    });
    it("should remove hover/active styles when the panel-list fires 'hidden'", () => {
      const panelList = container.querySelector("panel-list");
      fireEvent(panelList, new CustomEvent("shown"));
      fireEvent(panelList, new CustomEvent("hidden"));
      expect(container.querySelector("div.ads-context-menu")).not.toHaveClass(
        "context-menu-open"
      );
    });
    it("should call toggleActive when the panel-list opens and closes", () => {
      const toggleActive = jest.fn();
      const { container: c } = renderMenu({ toggleActive });
      const panelList = c.querySelector("panel-list");

      fireEvent(panelList, new CustomEvent("shown"));
      expect(toggleActive).toHaveBeenCalledWith(true);

      fireEvent(panelList, new CustomEvent("hidden"));
      expect(toggleActive).toHaveBeenCalledWith(false);
    });
    it("should render the correct menu options for ad banners with reporting INCLUDED", () => {
      const { container: c } = renderMenu({ showAdReporting: true });
      // BlockAdUrl, ReportAd, ManageSponsoredContent, OurSponsorsAndYourPrivacy
      expect(c.querySelectorAll("panel-item")).toHaveLength(4);
    });
    it("should render the correct menu options for ad banners with reporting EXCLUDED", () => {
      const { container: c } = renderMenu({ showAdReporting: false });
      // BlockAdUrl, ManageSponsoredContent, OurSponsorsAndYourPrivacy
      expect(c.querySelectorAll("panel-item")).toHaveLength(3);
    });
  });

  it("should render the context menu wrapper", () => {
    const { container } = render(
      <WrapWithProvider>
        <AdBannerContextMenu
          dispatch={jest.fn()}
          spoc={{
            title: "Test Ad",
            url: "https://example.com",
            shim: { url: "https://example.com/shim" },
          }}
          position={0}
          type="newtab_spocs"
          showAdReporting={false}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".ads-context-menu-wrapper")
    ).toBeInTheDocument();
  });
});
