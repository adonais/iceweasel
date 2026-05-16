import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { InterestPicker } from "content-src/components/DiscoveryStreamComponents/InterestPicker/InterestPicker";

describe("<InterestPicker>", () => {
  it("should render", () => {
    const { container } = render(
      <WrapWithProvider>
        <InterestPicker
          title="Topics"
          subtitle="Pick your interests"
          interests={[]}
          receivedFeedRank={0}
        />
      </WrapWithProvider>
    );
    expect(
      container.querySelector(".inline-selection-wrapper")
    ).toBeInTheDocument();
  });
});
