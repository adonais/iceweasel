import { act, render } from "@testing-library/react";
import { DSImage } from "content-src/components/DiscoveryStreamComponents/DSImage/DSImage";
import React from "react";

describe("Discovery Stream <DSImage>", () => {
  it("should have a child with class ds-image", () => {
    const { container } = render(<DSImage />);

    expect(container.querySelectorAll(".ds-image")).toHaveLength(1);
  });

  it("should set proper sources if only `source` is available", () => {
    const { container } = render(
      <DSImage source="https://placekitten.com/g/640/480" />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://placekitten.com/g/640/480"
    );
  });

  it("should set proper sources if `rawSource` is available", () => {
    const testSizes = [
      {
        mediaMatcher: "(min-width: 1122px)",
        width: 296,
        height: 148,
      },

      {
        mediaMatcher: "(min-width: 866px)",
        width: 218,
        height: 109,
      },

      {
        mediaMatcher: "(max-width: 610px)",
        width: 202,
        height: 101,
      },
    ];

    const { container } = render(
      <DSImage
        rawSource="https://placekitten.com/g/640/480"
        sizes={testSizes}
      />
    );

    const renderedImage = container.querySelector("img");

    expect(renderedImage).toHaveAttribute(
      "src",
      "https://placekitten.com/g/640/480"
    );
    expect(renderedImage).toHaveAttribute(
      "srcset",
      [
        "https://img-getpocket.cdn.mozilla.net/296x148/filters:format(webp):quality(75):no_upscale():strip_exif()/https%3A%2F%2Fplacekitten.com%2Fg%2F640%2F480 296w",
        "https://img-getpocket.cdn.mozilla.net/592x296/filters:format(webp):quality(75):no_upscale():strip_exif()/https%3A%2F%2Fplacekitten.com%2Fg%2F640%2F480 592w",
        "https://img-getpocket.cdn.mozilla.net/218x109/filters:format(webp):quality(75):no_upscale():strip_exif()/https%3A%2F%2Fplacekitten.com%2Fg%2F640%2F480 218w",
        "https://img-getpocket.cdn.mozilla.net/436x218/filters:format(webp):quality(75):no_upscale():strip_exif()/https%3A%2F%2Fplacekitten.com%2Fg%2F640%2F480 436w",
        "https://img-getpocket.cdn.mozilla.net/202x101/filters:format(webp):quality(75):no_upscale():strip_exif()/https%3A%2F%2Fplacekitten.com%2Fg%2F640%2F480 202w",
        "https://img-getpocket.cdn.mozilla.net/404x202/filters:format(webp):quality(75):no_upscale():strip_exif()/https%3A%2F%2Fplacekitten.com%2Fg%2F640%2F480 404w",
      ].join(",")
    );
    // The last size doubles as an explicit pixel size on the img so it renders
    // at its downloaded dimensions regardless of card width.
    expect(renderedImage).toHaveStyle({ width: "202px", height: "101px" });
  });

  it("should not set an explicit size when no sizes are provided", () => {
    const { container } = render(
      <DSImage rawSource="https://placekitten.com/g/640/480" />
    );

    expect(container.querySelector("img")).not.toHaveAttribute("style");
  });

  it("should fall back to unoptimized when optimized failed", () => {
    const imageRef = React.createRef();
    const { container } = render(
      <DSImage
        source="https://placekitten.com/g/640/480"
        rawSource="https://placekitten.com/g/640/480"
        ref={imageRef}
      />
    );
    act(() => {
      imageRef.current.setState({
        isSeen: true,
        containerWidth: 640,
        containerHeight: 480,
      });
      imageRef.current.onOptimizedImageError();
    });

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://placekitten.com/g/640/480"
    );
  });

  it("should render a placeholder image with no source and recent save", () => {
    const imageRef = React.createRef();
    const { container } = render(
      <DSImage isRecentSave={true} url="foo" title="bar" ref={imageRef} />
    );
    act(() => {
      imageRef.current.setState({ isSeen: true });
    });

    expect(container.querySelector("div")).toHaveClass("placeholder-image", {
      exact: true,
    });
  });

  it("should render a broken image with a source and a recent save", () => {
    const imageRef = React.createRef();
    const { container } = render(
      <DSImage isRecentSave={true} source="foo" ref={imageRef} />
    );
    act(() => {
      imageRef.current.setState({ isSeen: true });
      imageRef.current.onNonOptimizedImageError();
    });

    expect(container.querySelector("div")).toHaveClass("broken-image", {
      exact: true,
    });
  });

  it("should render a broken image without a source and not a recent save", () => {
    const imageRef = React.createRef();
    const { container } = render(
      <DSImage isRecentSave={false} ref={imageRef} />
    );
    act(() => {
      imageRef.current.setState({ isSeen: true });
      imageRef.current.onNonOptimizedImageError();
    });

    expect(container.querySelector("div")).toHaveClass("broken-image", {
      exact: true,
    });
  });

  it("should update loaded state when seen", () => {
    const imageRef = React.createRef();
    render(
      <DSImage rawSource="https://placekitten.com/g/640/480" ref={imageRef} />
    );

    act(() => {
      imageRef.current.onLoad();
    });
    expect(imageRef.current.state.isLoaded).toBe(true);
  });

  it("should set proper ohttp src if secureImage is true", () => {
    const rawSource = "https://placekitten.com/g/640/480";
    const { container } = render(
      <DSImage rawSource={rawSource} secureImage={true} />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      `moz-cached-ohttp://newtab-image/?url=${encodeURIComponent(rawSource)}`
    );
  });

  describe("DSImage with Idle Callback", () => {
    let wrapperRef;
    const windowStub = {
      requestIdleCallback: jest.fn().mockReturnValue(1),
      cancelIdleCallback: jest.fn(),
    };
    beforeEach(() => {
      wrapperRef = React.createRef();
      render(<DSImage windowObj={windowStub} ref={wrapperRef} />);
    });

    it("should call requestIdleCallback on componentDidMount", () => {
      expect(windowStub.requestIdleCallback).toHaveBeenCalledTimes(1);
    });

    it("should call cancelIdleCallback on componentWillUnmount", () => {
      wrapperRef.current.componentWillUnmount();
      expect(windowStub.cancelIdleCallback).toHaveBeenCalled();
    });
  });
});

describe("<DSImage>", () => {
  it("should render", () => {
    const { container } = render(<DSImage />);
    expect(container.querySelector(".ds-image")).toBeInTheDocument();
  });
});
