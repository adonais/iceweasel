import { render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { TopSiteWebNotification } from "content-src/components/TopSiteWebNotification/TopSiteWebNotification";

const ORIGIN = "https://example.com";

function mockState({
  enabled = true,
  gate = true,
  byOrigin = {},
  notifications = {},
} = {}) {
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
      notifications,
      byOrigin,
    },
  };
}

function renderBadge(link, stateOpts) {
  return render(
    <WrapWithProvider state={mockState(stateOpts)}>
      <TopSiteWebNotification link={link} />
    </WrapWithProvider>
  );
}

describe("<TopSiteWebNotification>", () => {
  const link = { url: `${ORIGIN}/path` };
  const populated = {
    byOrigin: { [ORIGIN]: ["a", "b"] },
    notifications: { a: { id: "a" }, b: { id: "b" } },
  };

  it("renders the count when enabled and the site has notifications", () => {
    const { container } = renderBadge(link, { enabled: true, ...populated });
    const badges = container.querySelectorAll(".top-site-web-notification");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("2");
  });

  it("renders nothing when the user pref is off", () => {
    const { container } = renderBadge(link, { enabled: false, ...populated });
    expect(
      container.querySelectorAll(".top-site-web-notification")
    ).toHaveLength(0);
  });

  it("renders nothing when the feature gate is off", () => {
    const { container } = renderBadge(link, { gate: false, ...populated });
    expect(
      container.querySelectorAll(".top-site-web-notification")
    ).toHaveLength(0);
  });

  it("renders nothing when the site has no notifications", () => {
    const { container } = renderBadge(link, { enabled: true });
    expect(
      container.querySelectorAll(".top-site-web-notification")
    ).toHaveLength(0);
  });

  it("resolves the count through the apex alias", () => {
    const { container } = renderBadge(
      { url: "https://gmail.com" },
      {
        enabled: true,
        byOrigin: { "https://mail.google.com": ["x"] },
        notifications: { x: { id: "x" } },
      }
    );
    expect(
      container.querySelector(".top-site-web-notification").textContent
    ).toBe("1");
  });
});
