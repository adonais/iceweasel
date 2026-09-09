import { mount } from "enzyme";
import { AdBannerContextMenu } from "content-src/components/DiscoveryStreamComponents/AdBannerContextMenu/AdBannerContextMenu";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";
import { Provider } from "react-redux";
import React from "react";
import { combineReducers, createStore } from "redux";

describe("<AdBannerContextMenu>", () => {
  let wrapper;

  function mountWithProps(props) {
    const store = createStore(combineReducers(reducers), INITIAL_STATE);
    return mount(
      <Provider store={store}>
        <AdBannerContextMenu {...props} />
      </Provider>
    );
  }

  describe("Ad banner context menu options", () => {
    const props = {
      dispatch: () => {},
      spoc: { url: "https://www.test.com/", shim: "aaabbbcccddd" },
      position: 1,
      type: "billboard",
      prefs: {},
    };

    beforeEach(() => {
      wrapper = mountWithProps(props);
    });

    afterEach(() => {
      wrapper.unmount();
    });

    it("should render a context menu button", () => {
      assert.ok(wrapper.exists());
      assert.ok(
        wrapper.find("moz-button").exists(),
        "context menu button exists"
      );

      // Make sure the menu wrapper has the correct default styles
      assert.isFalse(
        wrapper.find("div.ads-context-menu").hasClass("context-menu-open")
      );
    });

    it("should pair the moz-button and panel-list via menuId", () => {
      const button = wrapper.find("moz-button");
      const panelList = wrapper.find("panel-list");
      assert.ok(panelList.exists());
      assert.equal(button.prop("menuId"), panelList.prop("id"));
    });

    it("should add hover/active styles when the panel-list fires 'shown'", () => {
      const panelList = wrapper.find("panel-list").getDOMNode();
      panelList.dispatchEvent(new CustomEvent("shown"));
      wrapper.update();
      assert.isTrue(
        wrapper.find("div.ads-context-menu").hasClass("context-menu-open")
      );
    });

    it("should remove hover/active styles when the panel-list fires 'hidden'", () => {
      const panelList = wrapper.find("panel-list").getDOMNode();
      panelList.dispatchEvent(new CustomEvent("shown"));
      panelList.dispatchEvent(new CustomEvent("hidden"));
      wrapper.update();
      assert.isFalse(
        wrapper.find("div.ads-context-menu").hasClass("context-menu-open")
      );
    });

    it("should call toggleActive when the panel-list opens and closes", () => {
      const toggleActive = sinon.stub();
      wrapper = mountWithProps({ ...props, toggleActive });
      const panelList = wrapper.find("panel-list").getDOMNode();

      panelList.dispatchEvent(new CustomEvent("shown"));
      assert.calledWith(toggleActive, true);

      panelList.dispatchEvent(new CustomEvent("hidden"));
      assert.calledWith(toggleActive, false);
    });

    it("should render the correct menu options for ad banners with reporting INCLUDED", () => {
      wrapper = mountWithProps({ ...props, showAdReporting: true });
      // BlockAdUrl, ReportAd, ManageSponsoredContent, OurSponsorsAndYourPrivacy
      assert.lengthOf(wrapper.find("panel-item"), 4);
    });

    it("should render the correct menu options for ad banners with reporting EXCLUDED", () => {
      wrapper = mountWithProps({ ...props, showAdReporting: false });
      // BlockAdUrl, ManageSponsoredContent, OurSponsorsAndYourPrivacy
      assert.lengthOf(wrapper.find("panel-item"), 3);
    });
  });
});
