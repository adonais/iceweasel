import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { WallpaperFeatureHighlight } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/WallpaperFeatureHighlight";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";

describe("<WallpaperFeatureHighlight>", () => {
  it("should render when messageData has content", () => {
    const state = {
      ...INITIAL_STATE,
      Messages: {
        ...INITIAL_STATE.Messages,
        messageData: { content: { feature: "WALLPAPER" } },
      },
    };
    const { container } = render(
      <WrapWithProvider state={state}>
        <WallpaperFeatureHighlight
          dispatch={jest.fn()}
          handleDismiss={jest.fn()}
          handleClick={jest.fn()}
          handleBlock={jest.fn()}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".wallpaper-feature-highlight")
    ).toBeInTheDocument();
  });
});
