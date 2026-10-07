import { render } from "@testing-library/react";
import {
  DSContextFooter,
  DSMessageFooter,
} from "content-src/components/DiscoveryStreamComponents/DSContextFooter/DSContextFooter";
import { cardContextTypes } from "content-src/components/Card/types.mjs";

describe("<DSContextFooter>", () => {
  const bookmarkBadge = "bookmark";
  const removeBookmarkBadge = "removedBookmark";
  // eslint-disable-next-line no-shadow
  const context = "Sponsored by Babel";
  const sponsored_by_override = "Sponsored override";
  const engagement = "Popular";

  it("should render", () => {
    const { container } = render(<DSContextFooter />);
    expect(container).toBeInTheDocument();
  });
  it("should not render an engagement status if display_engagement_labels is false", () => {
    const { container } = render(
      <DSContextFooter
        display_engagement_labels={false}
        engagement={engagement}
      />
    );

    expect(
      container.querySelector(".story-view-count")
    ).not.toBeInTheDocument();
  });
  it("should render a badge if a proper badge prop is passed", () => {
    const { container } = render(
      <DSContextFooter context_type={bookmarkBadge} engagement={engagement} />
    );
    const { fluentID } = cardContextTypes[bookmarkBadge];

    expect(
      container.querySelector(".story-view-count")
    ).not.toBeInTheDocument();
    expect(container.querySelector(".story-context-label")).toHaveAttribute(
      "data-l10n-id",
      fluentID
    );
  });
  it("should only render a sponsored context if pass a sponsored context", () => {
    const { container } = render(
      <DSContextFooter
        context_type={bookmarkBadge}
        context={context}
        engagement={engagement}
      />
    );

    expect(
      container.querySelector(".story-view-count")
    ).not.toBeInTheDocument();
    expect(container.querySelector(".status-message")).not.toBeInTheDocument();
    expect(container.querySelector(".story-sponsored-label")).toHaveTextContent(
      context
    );
  });
  it("should render a sponsored_by_override if passed a sponsored_by_override", () => {
    const { container } = render(
      <DSContextFooter
        context_type={bookmarkBadge}
        context={context}
        sponsored_by_override={sponsored_by_override}
        engagement={engagement}
      />
    );

    expect(container.querySelector(".story-sponsored-label")).toHaveTextContent(
      sponsored_by_override
    );
  });
  it("should render nothing with a sponsored_by_override empty string", () => {
    const { container } = render(
      <DSContextFooter
        context_type={bookmarkBadge}
        context={context}
        sponsored_by_override=""
        engagement={engagement}
      />
    );

    expect(
      container.querySelector(".story-sponsored-label")
    ).not.toBeInTheDocument();
  });
  it("should render localized string with sponsor with no sponsored_by_override", () => {
    const { container } = render(
      <DSContextFooter
        context_type={bookmarkBadge}
        context={context}
        sponsor="Nimoy"
        engagement={engagement}
      />
    );

    expect(
      container.querySelector(
        ".story-sponsored-label [data-l10n-id='newtab-label-sponsored-by']"
      )
    ).toBeInTheDocument();
  });
  it("should render nova sponsor label with source-wrapper when novaEnabled is true", () => {
    const { container } = render(
      <DSContextFooter sponsor="Nimoy" novaEnabled={true} />
    );

    expect(container.querySelector(".source-wrapper")).toBeInTheDocument();
    expect(
      container.querySelector(".source-wrapper .source")
    ).toHaveTextContent("Nimoy");
    expect(container.querySelector(".ds-spoc-separator")).toBeInTheDocument();
    expect(container.querySelector(".ds-spoc-sponsored")).toBeInTheDocument();
  });
  it("should render a new badge if props change from an old badge to a new one", () => {
    const { container, rerender } = render(
      <DSContextFooter context_type={bookmarkBadge} />
    );

    const { fluentID: bookmarkFluentID } = cardContextTypes[bookmarkBadge];
    const bookmarkStatusMessage = container.querySelector(
      `div[data-l10n-id='${bookmarkFluentID}']`
    );
    expect(bookmarkStatusMessage).toBeInTheDocument();

    const { fluentID: removeBookmarkFluentID } =
      cardContextTypes[removeBookmarkBadge];

    rerender(<DSContextFooter context_type={removeBookmarkBadge} />);

    expect(bookmarkStatusMessage).not.toHaveAttribute(
      "data-l10n-id",
      removeBookmarkFluentID
    );
    const removedBookmarkStatusMessage = container.querySelector(
      `div[data-l10n-id='${removeBookmarkFluentID}']`
    );
    expect(removedBookmarkStatusMessage).toBeInTheDocument();
  });
  it("should render a story footer", () => {
    const { container } = render(
      <DSMessageFooter
        context_type={bookmarkBadge}
        engagement={engagement}
        display_engagement_labels={true}
      />
    );

    expect(container.querySelectorAll(".story-footer")).toHaveLength(1);
  });
});

describe("<DSContextFooter> sponsor label", () => {
  it("should render with sponsor label", () => {
    const { container } = render(<DSContextFooter sponsor="Test Sponsor" />);
    expect(container.querySelector(".story-footer")).toBeInTheDocument();
  });
});
