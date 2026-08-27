import { render } from "@testing-library/react";
import { MoreRecommendations } from "content-src/components/MoreRecommendations/MoreRecommendations";

describe("<MoreRecommendations>", () => {
  it("should render a MoreRecommendations element", () => {
    const { container } = render(<MoreRecommendations />);
    expect(container).toBeInTheDocument();
  });
  it("should render a link when provided with read_more_endpoint prop", () => {
    const { container } = render(
      <MoreRecommendations read_more_endpoint="https://endpoint.com" />
    );

    const link = container.querySelector(".more-recommendations");
    expect(link).toBeInTheDocument();
  });
  it("should not render a link when provided with read_more_endpoint prop", () => {
    const { container } = render(<MoreRecommendations read_more_endpoint="" />);

    const link = container.querySelector(".more-recommendations");
    expect(link).not.toBeInTheDocument();
  });
});
