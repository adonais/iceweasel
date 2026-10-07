import { fireEvent, render } from "@testing-library/react";
import { FollowSectionButtonHighlight } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/FollowSectionButtonHighlight";

describe("Discovery Stream <FollowSectionButtonHighlight>", () => {
  let container;
  let dispatch;
  let handleDismiss;
  let handleBlock;
  let messageData;

  beforeEach(() => {
    dispatch = jest.fn();
    handleDismiss = jest.fn();
    handleBlock = jest.fn();
    messageData = jest.fn();

    ({ container } = render(
      <FollowSectionButtonHighlight
        arrowPosition="arrow-inline-start"
        dispatch={dispatch}
        feature="FEATURE_FOLLOW_SECTION_BUTTON"
        handleBlock={handleBlock}
        handleDismiss={handleDismiss}
        isIntersecting={false}
        messageData={messageData}
        position="inset-inline-end"
        verticalPosition="inset-block-center"
      />
    ));
  });

  it("should render highlight container", () => {
    expect(container.firstChild).toBeInTheDocument();
    expect(
      container.querySelector(".follow-section-button-highlight")
    ).toBeInTheDocument();
  });

  it("should dispatch dismiss event and call handleDismiss and handleBlock", () => {
    fireEvent.click(
      container.querySelector(
        'moz-button[data-l10n-id="feature-highlight-dismiss-button"]'
      )
    );

    expect(handleDismiss).toHaveBeenCalledTimes(1);
    expect(handleBlock).toHaveBeenCalledTimes(1);
  });
});

describe("<FollowSectionButtonHighlight>", () => {
  it("should render", () => {
    const { container } = render(
      <FollowSectionButtonHighlight
        dispatch={jest.fn()}
        feature="FEATURE_HIGHLIGHT_DEFAULT"
        handleBlock={jest.fn()}
        handleDismiss={jest.fn()}
        messageData={{ content: {} }}
        position="top-left"
      />
    );
    expect(
      container.querySelector(".follow-section-button-highlight")
    ).toBeInTheDocument();
  });
});
