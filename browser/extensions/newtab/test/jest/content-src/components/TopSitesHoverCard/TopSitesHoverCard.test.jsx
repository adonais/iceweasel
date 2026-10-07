import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { TopSitesHoverCard } from "content-src/components/TopSitesHoverCard/TopSitesHoverCard";

const ORIGIN = "https://example.com";
const NOTIFICATIONS = {
  a: { id: "a", title: "A", origin: ORIGIN, persistent: true, timestamp: 1 },
};
const BY_ORIGIN = { [ORIGIN]: ["a"] };

function mockState(enabled, { gate = true } = {}) {
  return {
    ...INITIAL_STATE,
    Prefs: {
      ...INITIAL_STATE.Prefs,
      values: {
        ...INITIAL_STATE.Prefs.values,
        "system.showWebNotifications": gate,
        showWebNotifications: enabled,
      },
    },
    WebNotifications: {
      ...INITIAL_STATE.WebNotifications,
      notifications: NOTIFICATIONS,
      byOrigin: BY_ORIGIN,
    },
  };
}

function renderCard(link, enabled, opts) {
  return render(
    <WrapWithProvider state={mockState(enabled, opts)}>
      <TopSitesHoverCard link={link} />
    </WrapWithProvider>
  );
}

describe("<TopSitesHoverCard>", () => {
  const link = { url: `${ORIGIN}/path`, label: "Example" };

  it("renders nothing when the user pref is off", () => {
    const { container } = renderCard(link, false);
    expect(container.querySelectorAll(".top-sites-hover-card")).toHaveLength(0);
  });

  it("renders nothing when the feature gate is off", () => {
    const { container } = renderCard(link, true, { gate: false });
    expect(container.querySelectorAll(".top-sites-hover-card")).toHaveLength(0);
  });

  it("routes an ordinary tile to the notifications card", () => {
    const { container } = renderCard(link, true);
    expect(container.querySelectorAll(".top-sites-hover-card")).toHaveLength(1);
  });

  it("routes a sponsored tile to the ad variant (no notifications card)", () => {
    const { container } = renderCard(
      { url: `${ORIGIN}/path`, label: "Ad", sponsored_tile_id: 42 },
      true
    );
    expect(container.querySelectorAll(".top-sites-hover-card")).toHaveLength(0);
  });
});
