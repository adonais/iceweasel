import { render } from "@testing-library/react";
import { SectionContextMenu } from "content-src/components/DiscoveryStreamComponents/SectionContextMenu/SectionContextMenu";

describe("<SectionContextMenu>", () => {
  it("should render", () => {
    const { container } = render(
      <SectionContextMenu
        dispatch={jest.fn()}
        source=""
        index={0}
        sectionKey=""
        following={false}
        sectionPersonalization={null}
        sectionPosition={null}
      />
    );
    expect(
      container.querySelector(".section-context-menu")
    ).toBeInTheDocument();
  });
});
