import { fireEvent, render } from "@testing-library/react";
import { SafeAnchor } from "content-src/components/DiscoveryStreamComponents/SafeAnchor/SafeAnchor";

describe("Discovery Stream <SafeAnchor>", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("should render with anchor", () => {
    const { container } = render(<SafeAnchor />);
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("should render with anchor target for http", () => {
    // The http URL is intentional (verifies the http: protocol is allowed).
    /* eslint-disable sdl/no-insecure-url */
    const { container } = render(<SafeAnchor url="http://example.com" />);
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      "http://example.com"
    );
    /* eslint-enable sdl/no-insecure-url */
  });

  it("should render with anchor target for https", () => {
    const { container } = render(<SafeAnchor url="https://example.com" />);
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.com"
    );
  });

  it("should not allow javascript: URIs", () => {
    // eslint-disable-next-line no-script-url
    const { container } = render(<SafeAnchor url="javascript:foo()" />);
    expect(container.querySelector("a")).toHaveAttribute("href", "");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("should not warn if the URL is falsey ", () => {
    const { container } = render(<SafeAnchor url="" />);
    expect(container.querySelector("a")).toHaveAttribute("href", "");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("should dispatch an event on click", () => {
    const dispatch = jest.fn();
    const { container } = render(<SafeAnchor dispatch={dispatch} />);

    const notCancelled = fireEvent.click(container.querySelector("a"));

    expect(dispatch).toHaveBeenCalledTimes(1);
    // fireEvent returns false when the handler called event.preventDefault().
    expect(notCancelled).toBe(false);
  });

  it("should call onLinkClick if provided", () => {
    const onLinkClick = jest.fn();
    const { container } = render(<SafeAnchor onLinkClick={onLinkClick} />);

    fireEvent.click(container.querySelector("a"));

    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it("should render data-is-sponsored-link='false' when isSponsored is false", () => {
    const { container } = render(<SafeAnchor isSponsored={false} />);
    expect(container.querySelector("a")).toHaveAttribute(
      "data-is-sponsored-link",
      "false"
    );
  });

  it("should render data-is-sponsored-link='false' when isSponsored is not provided", () => {
    const { container } = render(<SafeAnchor />);
    expect(container.querySelector("a")).toHaveAttribute(
      "data-is-sponsored-link",
      "false"
    );
  });

  it("should render data-is-sponsored-link='true' when isSponsored is true", () => {
    const { container } = render(<SafeAnchor isSponsored={true} />);
    expect(container.querySelector("a")).toHaveAttribute(
      "data-is-sponsored-link",
      "true"
    );
  });
});

describe("<SafeAnchor>", () => {
  it("should render", () => {
    const { container } = render(
      <SafeAnchor url="https://example.com">Link</SafeAnchor>
    );
    expect(container.querySelector("a")).toBeInTheDocument();
  });
});
