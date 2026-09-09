import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { DSCard } from "content-src/components/DiscoveryStreamComponents/DSCard/DSCard";

describe("<DSCard>", () => {
  it("should render a placeholder when not yet seen", () => {
    const { container } = render(
      <WrapWithProvider>
        <DSCard dispatch={jest.fn()} type="DISCOVERY_STREAM" />
      </WrapWithProvider>
    );
    expect(container.querySelector(".ds-card")).toBeInTheDocument();
  });

  describe("section card images", () => {
    // DSCard is connected, so the sections pref has to come from the store.
    const SECTIONS_STATE = {
      ...INITIAL_STATE,
      Prefs: {
        ...INITIAL_STATE.Prefs,
        values: {
          ...INITIAL_STATE.Prefs.values,
          "discoverystream.sections.enabled": true,
        },
      },
    };

    // isForStartupCache marks the card seen on construction, which is what makes
    // the images render rather than the placeholder.
    const SEEN_PROPS = {
      App: { isForStartupCache: { App: true } },
      mayHaveSectionsCards: true,
      image_src: "image.jpg",
      url: "https://example.com",
      title: "Card",
    };

    const renderCard = sectionsCardImageSizes =>
      render(
        <WrapWithProvider state={SECTIONS_STATE}>
          <DSCard
            dispatch={jest.fn()}
            {...SEEN_PROPS}
            sectionsCardImageSizes={sectionsCardImageSizes}
          />
        </WrapWithProvider>
      );

    it("renders one image variant per column the layout defines", () => {
      const { container } = renderCard({
        1: "medium",
        2: "medium",
        3: "medium",
        4: "medium",
        5: "large",
      });

      expect(container.querySelectorAll(".ds-image")).toHaveLength(5);
      expect(container.querySelector(".image-5")).toBeInTheDocument();
    });

    it("renders no fifth variant for a four-column layout", () => {
      const { container } = renderCard({
        1: "medium",
        2: "medium",
        3: "medium",
        4: "medium",
      });

      expect(container.querySelectorAll(".ds-image")).toHaveLength(4);
      expect(container.querySelector(".image-5")).not.toBeInTheDocument();
    });
  });
});
