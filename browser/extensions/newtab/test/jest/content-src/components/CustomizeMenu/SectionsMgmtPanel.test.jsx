/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { SectionsMgmtPanel } from "content-src/components/CustomizeMenu/SectionsMgmtPanel/SectionsMgmtPanel";

// Note: The visibility of this component is controlled by the mayHaveTopicSections prop
// which is computed from these prefs in Base.jsx:
// - discoverystream.sections.enabled
// - discoverystream.topicLabels.enabled
// - discoverystream.sections.customizeMenuPanel.enabled
// - discoverystream.sections.personalization.enabled
// See ContentSection.test.jsx for tests of the visibility behavior.

const DEFAULT_STATE = {
  ...INITIAL_STATE,
  DiscoveryStream: {
    ...INITIAL_STATE.DiscoveryStream,
    layout: [
      {
        components: [
          {
            type: "CardGrid",
            feed: {
              url: "https://example.com/feed",
            },
          },
        ],
      },
    ],
    feeds: {
      data: {
        "https://example.com/feed": {
          data: {
            sections: [
              {
                sectionKey: "technology",
                title: "Technology",
                receivedRank: 0,
              },
              {
                sectionKey: "science",
                title: "Science",
                receivedRank: 1,
              },
              {
                sectionKey: "sports",
                title: "Sports",
                receivedRank: 2,
              },
            ],
          },
        },
      },
    },
    sectionPersonalization: {},
  },
};

function WrapWithProvider({ children, state = DEFAULT_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

describe("<SectionsMgmtPanel>", () => {
  let wrapper;
  let DEFAULT_PROPS;
  const fakeDate = "2020-01-01T00:00:00.000Z";

  beforeEach(() => {
    DEFAULT_PROPS = {
      pocketEnabled: true,
      togglePanel: jest.fn(),
      showPanel: false,
    };
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
  });

  it("should render the component", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
    expect(wrapper.container.firstChild).toBeInTheDocument();
  });

  it("should render the manage topics button", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
    const button = wrapper.container.querySelector("moz-box-button");
    expect(button).toBeInTheDocument();
  });

  it("should disable the button when pocketEnabled is false", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} pocketEnabled={false} />
      </WrapWithProvider>
    );
    const button = wrapper.container.querySelector("moz-box-button");
    expect(button).toHaveAttribute("disabled");
  });

  it("should not disable the button when pocketEnabled is true", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} pocketEnabled={true} />
      </WrapWithProvider>
    );
    const button = wrapper.container.querySelector("moz-box-button");
    expect(button).not.toHaveAttribute("disabled");
  });

  it("should call togglePanel when button is clicked", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} />
      </WrapWithProvider>
    );
    fireEvent.click(wrapper.container.querySelector("moz-box-button"));
    expect(DEFAULT_PROPS.togglePanel).toHaveBeenCalledTimes(1);
  });

  it("should render the panel when showPanel is true", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );
    expect(
      wrapper.container.querySelector(".sections-mgmt-panel")
    ).toBeInTheDocument();
  });

  it("should not render the panel when showPanel is false", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={false} />
      </WrapWithProvider>
    );
    expect(
      wrapper.container.querySelector(".sections-mgmt-panel")
    ).not.toBeInTheDocument();
  });

  it("should call togglePanel when arrow button is clicked (non-nova)", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    fireEvent.click(wrapper.container.querySelector("button.arrow-button"));
    expect(DEFAULT_PROPS.togglePanel).toHaveBeenCalledTimes(1);
  });

  it("should call togglePanel when arrow button is clicked (nova)", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel
          {...DEFAULT_PROPS}
          showPanel={true}
          novaEnabled={true}
        />
      </WrapWithProvider>
    );

    fireEvent.click(wrapper.container.querySelector("moz-button.arrow-button"));
    expect(DEFAULT_PROPS.togglePanel).toHaveBeenCalledTimes(1);
  });

  it("gives the back button an accessible name and tooltip", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel
          {...DEFAULT_PROPS}
          showPanel={true}
          novaEnabled={true}
        />
      </WrapWithProvider>
    );

    expect(
      wrapper.container.querySelector("moz-button.arrow-button")
    ).toHaveAttribute("data-l10n-id", "newtab-customize-panel-back-button");
  });

  describe("followed topics", () => {
    it("should render empty state when no topics are followed", () => {
      wrapper = render(
        <WrapWithProvider>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const emptyStates = wrapper.container.querySelectorAll(
        ".topic-list-empty-state"
      );
      expect(emptyStates).toHaveLength(2);
    });

    it("should render followed topics list when topics are followed", () => {
      const stateWithFollowedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: true,
              isBlocked: false,
              followedAt: fakeDate,
            },
          },
        },
      };

      wrapper = render(
        <WrapWithProvider state={stateWithFollowedTopics}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const topicList = wrapper.container.querySelector(".topic-list");
      expect(topicList).toBeInTheDocument();
      expect(topicList.querySelectorAll("li")).toHaveLength(1);
      expect(topicList.querySelector("li span").textContent).toBe("Technology");
    });

    it("should set localization attributes on the follow/unfollow button for accessible name", () => {
      const stateWithFollowedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: true,
              isBlocked: false,
              followedAt: fakeDate,
            },
          },
        },
      };

      wrapper = render(
        <WrapWithProvider state={stateWithFollowedTopics}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const button = wrapper.container.querySelector(
        "moz-button[section='technology']"
      );
      expect(button).toHaveAttribute(
        "data-l10n-id",
        "newtab-section-unfollow-topic"
      );
      expect(button).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ topic: "Technology" })
      );
    });

    it("should dispatch UNFOLLOW_SECTION action when unfollow button is clicked", () => {
      const stateWithFollowedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: true,
              isBlocked: false,
              followedAt: fakeDate,
            },
          },
        },
      };

      const store = createStore(
        combineReducers(reducers),
        stateWithFollowedTopics
      );
      const dispatchSpy = jest.spyOn(store, "dispatch");

      wrapper = render(
        <Provider store={store}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </Provider>
      );

      const unfollowButton = wrapper.container.querySelector(
        "#follow-topic-technology"
      );
      fireEvent.click(unfollowButton);

      expect(dispatchSpy.mock.calls[1][0]).toMatchObject({
        type: "UNFOLLOW_SECTION",
        data: {
          section: "technology",
          section_position: 0,
          event_source: "CUSTOMIZE_PANEL",
        },
        meta: {
          from: "ActivityStream:Content",
          to: "ActivityStream:Main",
          skipLocal: true,
        },
      });
    });

    it("should dispatch SECTION_PERSONALIZATION_SET when unfollowing", () => {
      const stateWithFollowedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: true,
              isBlocked: false,
              followedAt: fakeDate,
            },
          },
        },
      };

      const store = createStore(
        combineReducers(reducers),
        stateWithFollowedTopics
      );
      const dispatchSpy = jest.spyOn(store, "dispatch");

      wrapper = render(
        <Provider store={store}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </Provider>
      );

      const unfollowButton = wrapper.container.querySelector(
        "#follow-topic-technology"
      );
      fireEvent.click(unfollowButton);

      expect(dispatchSpy.mock.calls[0][0]).toMatchObject({
        type: "SECTION_PERSONALIZATION_SET",
        data: {},
        meta: {
          from: "ActivityStream:Content",
          to: "ActivityStream:Main",
        },
      });
    });
  });

  describe("blocked topics", () => {
    it("should render empty state when no topics are blocked", () => {
      wrapper = render(
        <WrapWithProvider>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const emptyStates = wrapper.container.querySelectorAll(
        ".topic-list-empty-state"
      );
      expect(emptyStates).toHaveLength(2);
    });

    it("should render blocked topics list when topics are blocked", () => {
      const stateWithBlockedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: false,
              isBlocked: true,
            },
          },
        },
      };

      wrapper = render(
        <WrapWithProvider state={stateWithBlockedTopics}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const topicList = wrapper.container.querySelector(".topic-list");
      expect(topicList).toBeInTheDocument();
      expect(topicList.querySelectorAll("li")).toHaveLength(1);
      expect(topicList.querySelector("li span").textContent).toBe("Technology");
    });

    it("should set localization attributes on the block/unblock button for accessible name", () => {
      const stateWithBlockedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: false,
              isBlocked: true,
            },
          },
        },
      };

      wrapper = render(
        <WrapWithProvider state={stateWithBlockedTopics}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const button = wrapper.container.querySelector(
        "moz-button[section='technology']"
      );
      expect(button).toHaveAttribute(
        "data-l10n-id",
        "newtab-section-unblock-topic"
      );
      expect(button).toHaveAttribute(
        "data-l10n-args",
        JSON.stringify({ topic: "Technology" })
      );
    });

    it("should dispatch UNBLOCK_SECTION action when unblock button is clicked", () => {
      const stateWithBlockedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: false,
              isBlocked: true,
            },
          },
        },
      };

      const store = createStore(
        combineReducers(reducers),
        stateWithBlockedTopics
      );
      const dispatchSpy = jest.spyOn(store, "dispatch");

      wrapper = render(
        <Provider store={store}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </Provider>
      );

      const unblockButton = wrapper.container.querySelector(
        "#blocked-topic-technology"
      );
      fireEvent.click(unblockButton);

      expect(dispatchSpy.mock.calls[1][0]).toMatchObject({
        type: "UNBLOCK_SECTION",
        data: {
          section: "technology",
          section_position: 0,
          event_source: "CUSTOMIZE_PANEL",
        },
        meta: {
          from: "ActivityStream:Content",
          to: "ActivityStream:Main",
          skipLocal: true,
        },
      });
    });

    it("should dispatch SECTION_PERSONALIZATION_SET when unblocking", () => {
      const stateWithBlockedTopics = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            technology: {
              isFollowed: false,
              isBlocked: true,
            },
          },
        },
      };

      const store = createStore(
        combineReducers(reducers),
        stateWithBlockedTopics
      );
      const dispatchSpy = jest.spyOn(store, "dispatch");

      wrapper = render(
        <Provider store={store}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </Provider>
      );

      const unblockButton = wrapper.container.querySelector(
        "#blocked-topic-technology"
      );
      fireEvent.click(unblockButton);

      expect(dispatchSpy.mock.calls[0][0]).toMatchObject({
        type: "SECTION_PERSONALIZATION_SET",
        data: {},
        meta: {
          from: "ActivityStream:Content",
          to: "ActivityStream:Main",
        },
      });
    });

    it("should render a blocked section absent from the feed using its stored title", () => {
      const stateWithOffFeedBlocked = {
        ...DEFAULT_STATE,
        DiscoveryStream: {
          ...DEFAULT_STATE.DiscoveryStream,
          sectionPersonalization: {
            cooking: {
              isFollowed: false,
              isBlocked: true,
              title: "Cooking",
            },
          },
        },
      };

      wrapper = render(
        <WrapWithProvider state={stateWithOffFeedBlocked}>
          <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
        </WrapWithProvider>
      );

      const topicList = wrapper.container.querySelector(".topic-list");
      expect(topicList).toBeInTheDocument();
      expect(topicList.querySelectorAll("li")).toHaveLength(1);
      expect(topicList.querySelector("span").textContent).toBe("Cooking");
    });
  });

  it("should render multiple followed topics", () => {
    const stateWithMultipleFollowed = {
      ...DEFAULT_STATE,
      DiscoveryStream: {
        ...DEFAULT_STATE.DiscoveryStream,
        sectionPersonalization: {
          technology: {
            isFollowed: true,
            isBlocked: false,
            followedAt: fakeDate,
          },
          science: {
            isFollowed: true,
            isBlocked: false,
            followedAt: "2024-01-02T00:00:00.000Z",
          },
        },
      },
    };

    wrapper = render(
      <WrapWithProvider state={stateWithMultipleFollowed}>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    const topicList = wrapper.container.querySelector(".topic-list");
    expect(topicList.querySelectorAll("li")).toHaveLength(2);
    expect(topicList.textContent).toContain("Technology");
    expect(topicList.textContent).toContain("Science");
  });

  it("should render multiple blocked topics", () => {
    const stateWithMultipleBlocked = {
      ...DEFAULT_STATE,
      DiscoveryStream: {
        ...DEFAULT_STATE.DiscoveryStream,
        sectionPersonalization: {
          technology: {
            isFollowed: false,
            isBlocked: true,
          },
          science: {
            isFollowed: false,
            isBlocked: true,
          },
        },
      },
    };

    wrapper = render(
      <WrapWithProvider state={stateWithMultipleBlocked}>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    const topicList = wrapper.container.querySelector(".topic-list");
    expect(topicList.querySelectorAll("li")).toHaveLength(2);
    expect(topicList.textContent).toContain("Technology");
    expect(topicList.textContent).toContain("Science");
  });

  it("should have the correct button classes for followed topics", () => {
    const stateWithFollowedTopics = {
      ...DEFAULT_STATE,
      DiscoveryStream: {
        ...DEFAULT_STATE.DiscoveryStream,
        sectionPersonalization: {
          technology: {
            isFollowed: true,
            isBlocked: false,
            followedAt: fakeDate,
          },
        },
      },
    };

    wrapper = render(
      <WrapWithProvider state={stateWithFollowedTopics}>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    const followDiv = wrapper.container.querySelector(".section-follow");
    expect(followDiv).toHaveClass("following");
  });

  it("should have the correct button classes for blocked topics", () => {
    const stateWithBlockedTopics = {
      ...DEFAULT_STATE,
      DiscoveryStream: {
        ...DEFAULT_STATE.DiscoveryStream,
        sectionPersonalization: {
          technology: {
            isFollowed: false,
            isBlocked: true,
          },
        },
      },
    };

    wrapper = render(
      <WrapWithProvider state={stateWithBlockedTopics}>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    const blockDiv = wrapper.container.querySelector(".section-block");
    expect(blockDiv).toHaveClass("blocked");
  });

  it("should render panel title and headers (non-nova)", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    const panel = wrapper.container.querySelector(".sections-mgmt-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.querySelectorAll("h1")).toHaveLength(1);
    expect(panel.querySelectorAll("h3")).toHaveLength(2);
  });

  it("should render without throwing when feed data has failed status (no sections)", () => {
    const stateWithFailedFeed = {
      ...DEFAULT_STATE,
      DiscoveryStream: {
        ...DEFAULT_STATE.DiscoveryStream,
        feeds: {
          data: {
            "https://example.com/feed": {
              data: { status: "failed" },
            },
          },
        },
      },
    };

    wrapper = render(
      <WrapWithProvider state={stateWithFailedFeed}>
        <SectionsMgmtPanel {...DEFAULT_PROPS} showPanel={true} />
      </WrapWithProvider>
    );

    expect(
      wrapper.container.querySelector("moz-box-button")
    ).toBeInTheDocument();
    const emptyStates = wrapper.container.querySelectorAll(
      ".topic-list-empty-state"
    );
    expect(emptyStates).toHaveLength(2);
  });

  it("should render panel title and headers (nova)", () => {
    wrapper = render(
      <WrapWithProvider>
        <SectionsMgmtPanel
          {...DEFAULT_PROPS}
          showPanel={true}
          novaEnabled={true}
        />
      </WrapWithProvider>
    );

    const panel = wrapper.container.querySelector(".sections-mgmt-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.querySelectorAll("h2")).toHaveLength(1);
    expect(panel.querySelectorAll("h3")).toHaveLength(2);
  });
});
