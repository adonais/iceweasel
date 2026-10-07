import { fireEvent, render } from "@testing-library/react";
import { combineReducers, createStore } from "redux";
import { Provider } from "react-redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import {
  _TopicsWidget as TopicsWidgetBase,
  TopicsWidget,
} from "content-src/components/DiscoveryStreamComponents/TopicsWidget/TopicsWidget";

describe("Discovery Stream <TopicsWidget>", () => {
  let wrapper;
  let dispatch;
  let fakeWindow;

  beforeEach(() => {
    dispatch = jest.fn();
    fakeWindow = {
      innerWidth: 1000,
      innerHeight: 900,
    };

    wrapper = render(
      <TopicsWidgetBase
        dispatch={dispatch}
        source="CARDGRID_WIDGET"
        position={2}
        id={1}
        windowObj={fakeWindow}
        DiscoveryStream={{
          experimentData: {
            utmCampaign: "utmCampaign",
            utmContent: "utmContent",
            utmSource: "utmSource",
          },
        }}
      />
    );
  });

  it("should render", () => {
    expect(wrapper.container.firstChild).toBeInTheDocument();
    expect(
      wrapper.container.querySelector(".ds-topics-widget")
    ).toBeInTheDocument();
  });

  it("should connect with DiscoveryStream store", () => {
    const store = createStore(combineReducers(reducers), INITIAL_STATE);
    const { container } = render(
      <Provider store={store}>
        <TopicsWidget />
      </Provider>
    );

    // Enzyme matched the inner _TopicsWidget by component identity; in RTL we
    // assert the single widget rendered by the connected component instead.
    const topicsWidget = container.querySelectorAll(".ds-topics-widget");
    expect(topicsWidget).toHaveLength(1);
    // Enzyme read DiscoveryStream.experimentData off the props; the observable
    // RTL proxy is that the store's utmSource flows into the topic link URLs.
    expect(container.querySelector("a").getAttribute("href")).toContain(
      `utm_source=${INITIAL_STATE.DiscoveryStream.experimentData.utmSource}`
    );
  });

  describe("dispatch", () => {
    it("should dispatch loaded event", () => {
      expect(dispatch).toHaveBeenCalledTimes(1);
      const [first] = dispatch.mock.calls;
      expect(first[0]).toEqual(
        ac.DiscoveryStreamLoadedContent({
          source: "CARDGRID_WIDGET",
          tiles: [
            {
              id: 1,
              pos: 2,
            },
          ],
        })
      );
    });

    it("should dispatch click event for technology", () => {
      // Click technology topic.
      fireEvent.click(wrapper.container.querySelectorAll("a")[0]);

      // First call is DiscoveryStreamLoadedContent, which is already tested.
      const [second, third, fourth] = dispatch.mock.calls.slice(1, 4);

      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(second[0]).toEqual(
        ac.OnlyToMain({
          type: at.OPEN_LINK,
          data: {
            event: {
              altKey: false,
              button: 0,
              ctrlKey: false,
              metaKey: false,
              shiftKey: false,
            },
            referrer: "https://getpocket.com/recommendations",
            url: "https://getpocket.com/explore/technology?utm_source=utmSource&utm_content=utmContent&utm_campaign=utmCampaign",
            is_sponsored: undefined,
          },
        })
      );
      expect(third[0]).toEqual(
        ac.DiscoveryStreamUserEvent({
          event: "CLICK",
          source: "CARDGRID_WIDGET",
          action_position: 2,
          value: {
            card_type: "topics_widget",
            topic: "technology",
            position_in_card: 0,
            section_position: 2,
          },
        })
      );
      expect(fourth[0]).toEqual(
        ac.ImpressionStats({
          click: 0,
          source: "CARDGRID_WIDGET",
          tiles: [{ id: 1, pos: 2 }],
          window_inner_width: 1000,
          window_inner_height: 900,
        })
      );
    });

    it("should dispatch click event for must reads", () => {
      // Click must reads topic.
      fireEvent.click(wrapper.container.querySelectorAll("a")[8]);

      // First call is DiscoveryStreamLoadedContent, which is already tested.
      const [second, third, fourth] = dispatch.mock.calls.slice(1, 4);

      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(second[0]).toEqual(
        ac.OnlyToMain({
          type: at.OPEN_LINK,
          data: {
            event: {
              altKey: false,
              button: 0,
              ctrlKey: false,
              metaKey: false,
              shiftKey: false,
            },
            referrer: "https://getpocket.com/recommendations",
            url: "https://getpocket.com/collections?utm_source=utmSource&utm_content=utmContent&utm_campaign=utmCampaign",
            is_sponsored: undefined,
          },
        })
      );
      expect(third[0]).toEqual(
        ac.DiscoveryStreamUserEvent({
          event: "CLICK",
          source: "CARDGRID_WIDGET",
          action_position: 2,
          value: {
            card_type: "topics_widget",
            topic: "must-reads",
            position_in_card: 8,
            section_position: 2,
          },
        })
      );
      expect(fourth[0]).toEqual(
        ac.ImpressionStats({
          click: 0,
          source: "CARDGRID_WIDGET",
          tiles: [{ id: 1, pos: 2 }],
          window_inner_width: 1000,
          window_inner_height: 900,
        })
      );
    });

    it("should dispatch click event for more topics", () => {
      // Click more-topics.
      fireEvent.click(wrapper.container.querySelectorAll("a")[9]);

      // First call is DiscoveryStreamLoadedContent, which is already tested.
      const [second, third, fourth] = dispatch.mock.calls.slice(1, 4);

      expect(dispatch).toHaveBeenCalledTimes(4);
      expect(second[0]).toEqual(
        ac.OnlyToMain({
          type: at.OPEN_LINK,
          data: {
            event: {
              altKey: false,
              button: 0,
              ctrlKey: false,
              metaKey: false,
              shiftKey: false,
            },
            referrer: "https://getpocket.com/recommendations",
            url: "https://getpocket.com/?utm_source=utmSource&utm_content=utmContent&utm_campaign=utmCampaign",
            is_sponsored: undefined,
          },
        })
      );
      expect(third[0]).toEqual(
        ac.DiscoveryStreamUserEvent({
          event: "CLICK",
          source: "CARDGRID_WIDGET",
          action_position: 2,
          value: {
            card_type: "topics_widget",
            topic: "more-topics",
            section_position: 2,
          },
        })
      );
      expect(fourth[0]).toEqual(
        ac.ImpressionStats({
          click: 0,
          source: "CARDGRID_WIDGET",
          tiles: [{ id: 1, pos: 2 }],
          window_inner_width: 1000,
          window_inner_height: 900,
        })
      );
    });
  });
});
