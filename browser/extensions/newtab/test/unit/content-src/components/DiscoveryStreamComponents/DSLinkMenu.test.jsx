import { mount } from "enzyme";
import { DSLinkMenu } from "content-src/components/DiscoveryStreamComponents/DSLinkMenu/DSLinkMenu";
import { PanelListItems } from "content-src/components/LinkMenu/PanelListItems";
import React from "react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";

describe("<DSLinkMenu>", () => {
  let wrapper;
  let store;

  beforeEach(() => {
    store = createStore(combineReducers(reducers), INITIAL_STATE);
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  const mountMenu = props =>
    mount(
      <Provider store={store}>
        <DSLinkMenu {...props} />
      </Provider>
    );

  describe("DS link menu actions", () => {
    it("should parse args for fluent correctly", () => {
      const title = '"fluent"';
      wrapper = mountMenu({ title });
      const button = wrapper.find(
        "moz-button[data-l10n-id='newtab-menu-content-tooltip']"
      );
      assert.equal(button.prop("data-l10n-args"), JSON.stringify({ title }));
    });
  });

  describe("DS context menu options", () => {
    const ValidDSLinkMenuProps = { card_type: "organic" };

    // getLinkMenuOptions maps each option key to one option object, so the
    // length of PanelListItems' options reflects the selected option keys.
    const optionCount = w => w.find(PanelListItems).prop("options").length;

    it("should render a moz-button trigger paired to a panel-list", () => {
      wrapper = mountMenu(ValidDSLinkMenuProps);
      const button = wrapper.find("moz-button");
      const panelList = wrapper.find("panel-list");
      assert.equal(button.length, 1);
      assert.equal(panelList.length, 1);
      // moz-button opens the panel-list via the shared menuId.
      assert.equal(button.prop("menuId"), panelList.prop("id"));
    });

    it("should render the built menu options via PanelListItems", () => {
      wrapper = mountMenu(ValidDSLinkMenuProps);
      assert.isArray(wrapper.find(PanelListItems).prop("options"));
    });

    it("should build the correct menu options for recommended stories", () => {
      // CheckBookmark, Separator, OpenInNewWindow, OpenInPrivateWindow,
      // Separator, BlockUrl
      wrapper = mountMenu(ValidDSLinkMenuProps);
      assert.equal(optionCount(wrapper), 6);
    });

    it("should add ReportContent when a section is defined", () => {
      wrapper = mountMenu({ ...ValidDSLinkMenuProps, section: "abc" });
      assert.equal(optionCount(wrapper), 7);
    });

    it("should build the correct menu options for SPOCs", () => {
      // BlockUrl, ManageSponsoredContent, OurSponsorsAndYourPrivacy
      wrapper = mountMenu({ ...ValidDSLinkMenuProps, card_type: "spoc" });
      assert.equal(optionCount(wrapper), 3);
    });

    it("should add ReportAd for SPOCs when ad reporting is enabled", () => {
      const stateWithReporting = {
        ...INITIAL_STATE,
        Prefs: {
          ...INITIAL_STATE.Prefs,
          values: {
            ...INITIAL_STATE.Prefs.values,
            "discoverystream.reportAds.enabled": true,
          },
        },
      };
      store = createStore(combineReducers(reducers), stateWithReporting);
      wrapper = mountMenu({
        ...ValidDSLinkMenuProps,
        card_type: "spoc",
        shim: { report: {} },
      });
      // BlockUrl, ReportAd, ManageSponsoredContent, OurSponsorsAndYourPrivacy
      assert.equal(optionCount(wrapper), 4);
    });
  });
});
