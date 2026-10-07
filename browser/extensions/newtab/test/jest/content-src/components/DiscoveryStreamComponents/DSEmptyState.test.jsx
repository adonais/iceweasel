import { fireEvent, render } from "@testing-library/react";
import { DSEmptyState } from "content-src/components/DiscoveryStreamComponents/DSEmptyState/DSEmptyState";

describe("<DSEmptyState>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = render(<DSEmptyState />);
  });

  it("should render", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(".section-empty-state")
    ).toBeInTheDocument();
  });

  it("should render defaultempty state message", () => {
    expect(
      wrapper.container.querySelector(".empty-state-message")
    ).toBeInTheDocument();
    const header = wrapper.container.querySelector(
      "h2[data-l10n-id='newtab-discovery-empty-section-topstories-header']"
    );
    const paragraph = wrapper.container.querySelector(
      "p[data-l10n-id='newtab-discovery-empty-section-topstories-content']"
    );

    expect(header).toBeInTheDocument();
    expect(paragraph).toBeInTheDocument();
  });

  it("should render failed state message", () => {
    wrapper = render(<DSEmptyState status="failed" />);
    const button = wrapper.container.querySelector(
      "button[data-l10n-id='newtab-discovery-empty-section-topstories-try-again-button']"
    );

    expect(button).toBeInTheDocument();
  });

  it("should render waiting state message", () => {
    wrapper = render(<DSEmptyState status="waiting" />);
    const button = wrapper.container.querySelector(
      "button[data-l10n-id='newtab-discovery-empty-section-topstories-loading']"
    );

    expect(button).toBeInTheDocument();
  });

  it("should dispatch DISCOVERY_STREAM_RETRY_FEED on failed state button click", () => {
    const dispatch = jest.fn();

    wrapper = render(
      <DSEmptyState
        status="failed"
        dispatch={dispatch}
        feed={{ url: "https://foo.com", data: {} }}
      />
    );
    fireEvent.click(wrapper.container.querySelector("button.try-again-button"));

    expect(dispatch).toHaveBeenCalledTimes(2);
    const [firstCallArgs, secondCallArgs] = dispatch.mock.calls;
    let [action] = firstCallArgs;
    expect(action.type).toBe("DISCOVERY_STREAM_FEED_UPDATE");
    expect(action.data.feed).toEqual({
      url: "https://foo.com",
      data: { status: "waiting" },
    });

    [action] = secondCallArgs;

    expect(action.type).toBe("DISCOVERY_STREAM_RETRY_FEED");
    expect(action.data.feed).toEqual({ url: "https://foo.com", data: {} });
  });
});
