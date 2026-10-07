/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
import {
  actionCreators as ac,
  actionTypes as at,
  CONTENT_MESSAGE_TYPE,
  MAIN_MESSAGE_TYPE,
  PRELOAD_MESSAGE_TYPE,
} from "common/Actions.mjs";
import { EventEmitter, mockServices, stubGlobals } from "test/jest/test-utils";
import { SectionsFeed, SectionsManager } from "lib/SectionsManager.sys.mjs";

const FAKE_ID = "FAKE_ID";
const FAKE_OPTIONS = { icon: "FAKE_ICON", title: "FAKE_TITLE" };
const FAKE_ROWS = [
  { url: "1.example.com", type: "bookmark" },
  { url: "2.example.com", type: "pocket" },
  { url: "3.example.com", type: "history" },
];
const FAKE_TRENDING_ROWS = [{ url: "bar", type: "trending" }];
const FAKE_URL = "2.example.com";
const FAKE_CARD_OPTIONS = { title: "Some fake title" };

// jest-setup.mjs fails any test that logs to console.error, so cases that log
// on purpose swallow the calls and mockRestore() before the guard checks.
const silenceConsoleError = () =>
  jest.spyOn(console, "error").mockImplementation(() => {});

describe("SectionsManager", () => {
  let restoreGlobals;
  let fakeServices;
  let fakePlacesUtils;

  beforeEach(async () => {
    fakeServices = mockServices(["prefs"]);
    fakePlacesUtils = {
      history: { update: jest.fn(), insert: jest.fn() },
    };
    restoreGlobals = stubGlobals({
      Services: fakeServices,
      PlacesUtils: fakePlacesUtils,
      NimbusFeatures: {
        newtab: { getAllVariables: jest.fn() },
        pocketNewtab: { getAllVariables: jest.fn() },
      },
    });
    // Redecorate SectionsManager to remove any listeners that have been added
    EventEmitter.decorate(SectionsManager);
  });

  afterEach(() => {
    restoreGlobals();
    jest.restoreAllMocks();
  });

  describe("#init", () => {
    it("should initialise the sections map with the built in sections", async () => {
      SectionsManager.sections.clear();
      SectionsManager.initialized = false;
      await SectionsManager.init({});
      expect(SectionsManager.sections.size).toBe(2);
      expect(SectionsManager.sections.has("topstories")).toBeTruthy();
      expect(SectionsManager.sections.has("highlights")).toBeTruthy();
    });
    it("should set .initialized to true", async () => {
      SectionsManager.sections.clear();
      SectionsManager.initialized = false;
      await SectionsManager.init({});
      expect(SectionsManager.initialized).toBeTruthy();
    });
    it("should add observer for context menu prefs", async () => {
      SectionsManager.CONTEXT_MENU_PREFS = { MENU_ITEM: "MENU_ITEM_PREF" };
      await SectionsManager.init({});
      expect(fakeServices.prefs.addObserver).toHaveBeenCalledTimes(1);
      expect(fakeServices.prefs.addObserver).toHaveBeenCalledWith(
        "MENU_ITEM_PREF",
        SectionsManager
      );
    });
  });
  describe("#uninit", () => {
    it("should remove observer for context menu prefs", () => {
      SectionsManager.CONTEXT_MENU_PREFS = { MENU_ITEM: "MENU_ITEM_PREF" };
      SectionsManager.initialized = true;
      SectionsManager.uninit();
      expect(fakeServices.prefs.removeObserver).toHaveBeenCalledTimes(1);
      expect(fakeServices.prefs.removeObserver).toHaveBeenCalledWith(
        "MENU_ITEM_PREF",
        SectionsManager
      );
      expect(SectionsManager.initialized).toBe(false);
    });
  });
  describe("#addBuiltInSection", () => {
    it("should not report an error if options is undefined", async () => {
      const consoleError = silenceConsoleError();
      await SectionsManager.addBuiltInSection(
        "feeds.section.topstories",
        undefined
      );

      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
    it("should report an error if options is malformed", async () => {
      const consoleError = silenceConsoleError();
      await SectionsManager.addBuiltInSection(
        "feeds.section.topstories",
        "invalid"
      );

      expect(consoleError).toHaveBeenCalledTimes(1);
      consoleError.mockRestore();
    });
  });
  describe("#addSection", () => {
    it("should add the id to sections and emit an ADD_SECTION event", () => {
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.ADD_SECTION, spy);
      SectionsManager.addSection(FAKE_ID, FAKE_OPTIONS);
      expect(SectionsManager.sections.has(FAKE_ID)).toBeTruthy();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        SectionsManager.ADD_SECTION,
        FAKE_ID,
        FAKE_OPTIONS
      );
    });
  });
  describe("#removeSection", () => {
    it("should remove the id from sections and emit an REMOVE_SECTION event", () => {
      // Ensure we start with the id in the set
      expect(SectionsManager.sections.has(FAKE_ID)).toBeTruthy();
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.REMOVE_SECTION, spy);
      SectionsManager.removeSection(FAKE_ID);
      expect(SectionsManager.sections.has(FAKE_ID)).toBeFalsy();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(SectionsManager.REMOVE_SECTION, FAKE_ID);
    });
  });
  describe("#enableSection", () => {
    it("should call updateSection with {enabled: true}", () => {
      jest.spyOn(SectionsManager, "updateSection");
      SectionsManager.addSection(FAKE_ID, FAKE_OPTIONS);
      SectionsManager.enableSection(FAKE_ID);
      expect(SectionsManager.updateSection).toHaveBeenCalledTimes(1);
      expect(SectionsManager.updateSection).toHaveBeenCalledWith(
        FAKE_ID,
        { enabled: true },
        true,
        false
      );
      SectionsManager.updateSection.mockRestore();
    });
    it("should emit an ENABLE_SECTION event", () => {
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.ENABLE_SECTION, spy);
      SectionsManager.enableSection(FAKE_ID);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(SectionsManager.ENABLE_SECTION, FAKE_ID);
    });
  });
  describe("#disableSection", () => {
    it("should call updateSection with {enabled: false, rows: [], initialized: false}", () => {
      jest.spyOn(SectionsManager, "updateSection");
      SectionsManager.addSection(FAKE_ID, FAKE_OPTIONS);
      SectionsManager.disableSection(FAKE_ID);
      expect(SectionsManager.updateSection).toHaveBeenCalledTimes(1);
      expect(SectionsManager.updateSection).toHaveBeenCalledWith(
        FAKE_ID,
        { enabled: false, rows: [], initialized: false },
        true
      );
      SectionsManager.updateSection.mockRestore();
    });
    it("should emit a DISABLE_SECTION event", () => {
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.DISABLE_SECTION, spy);
      SectionsManager.disableSection(FAKE_ID);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        SectionsManager.DISABLE_SECTION,
        FAKE_ID
      );
    });
  });
  describe("#updateSection", () => {
    it("should emit an UPDATE_SECTION event with correct arguments", () => {
      SectionsManager.addSection(FAKE_ID, FAKE_OPTIONS);
      const spy = jest.fn();
      const dedupeConfigurations = [
        { id: "topstories", dedupeFrom: ["highlights"] },
      ];
      SectionsManager.on(SectionsManager.UPDATE_SECTION, spy);
      SectionsManager.updateSection(FAKE_ID, { rows: FAKE_ROWS }, true);
      expect(spy).toHaveBeenCalledTimes(1);
      // The trailing `false` is updateSection's isStartup default.
      expect(spy).toHaveBeenCalledWith(
        SectionsManager.UPDATE_SECTION,
        FAKE_ID,
        { rows: FAKE_ROWS, dedupeConfigurations },
        true,
        false
      );
    });
    it("should do nothing if the section doesn't exist", () => {
      SectionsManager.removeSection(FAKE_ID);
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.UPDATE_SECTION, spy);
      SectionsManager.updateSection(FAKE_ID, { rows: FAKE_ROWS }, true);
      expect(spy).not.toHaveBeenCalled();
    });
    it("should update all sections", () => {
      SectionsManager.sections.clear();
      const updateSectionOrig = SectionsManager.updateSection;
      SectionsManager.updateSection = jest.fn();

      SectionsManager.addSection("ID1", { title: "FAKE_TITLE_1" });
      SectionsManager.addSection("ID2", { title: "FAKE_TITLE_2" });
      SectionsManager.updateSections();

      expect(SectionsManager.updateSection).toHaveBeenCalledTimes(2);
      expect(SectionsManager.updateSection).toHaveBeenCalledWith(
        "ID1",
        { title: "FAKE_TITLE_1" },
        true
      );
      expect(SectionsManager.updateSection).toHaveBeenCalledWith(
        "ID2",
        { title: "FAKE_TITLE_2" },
        true
      );
      SectionsManager.updateSection = updateSectionOrig;
    });
    it("context menu pref change should update sections", async () => {
      let observer;
      fakeServices.prefs.getBoolPref.mockImplementation(() => {});
      fakeServices.prefs.addObserver.mockImplementation((pref, o) => {
        observer = o;
      });

      SectionsManager.updateSections = jest.fn();
      SectionsManager.CONTEXT_MENU_PREFS = { MENU_ITEM: "MENU_ITEM_PREF" };
      await SectionsManager.init({});
      observer.observe("", "nsPref:changed", "MENU_ITEM_PREF");

      expect(SectionsManager.updateSections).toHaveBeenCalledTimes(1);
    });
  });
  describe("#_addCardTypeLinkMenuOptions", () => {
    const addCardTypeLinkMenuOptionsOrig =
      SectionsManager._addCardTypeLinkMenuOptions;
    const contextMenuOptionsOrig =
      SectionsManager.CONTEXT_MENU_OPTIONS_FOR_HIGHLIGHT_TYPES;
    beforeEach(() => {
      // Add a topstories section and a highlights section, with types for each card
      SectionsManager.addSection("topstories", { FAKE_TRENDING_ROWS });
      SectionsManager.addSection("highlights", { FAKE_ROWS });
    });
    it("should only call _addCardTypeLinkMenuOptions if the section update is for highlights", () => {
      SectionsManager._addCardTypeLinkMenuOptions = jest.fn();
      SectionsManager.updateSection("topstories", { rows: FAKE_ROWS }, false);
      expect(
        SectionsManager._addCardTypeLinkMenuOptions
      ).not.toHaveBeenCalled();

      SectionsManager.updateSection("highlights", { rows: FAKE_ROWS }, false);
      expect(SectionsManager._addCardTypeLinkMenuOptions).toHaveBeenCalledWith(
        FAKE_ROWS
      );
    });
    it("should only call _addCardTypeLinkMenuOptions if the section update has rows", () => {
      SectionsManager._addCardTypeLinkMenuOptions = jest.fn();
      SectionsManager.updateSection("highlights", {}, false);
      expect(
        SectionsManager._addCardTypeLinkMenuOptions
      ).not.toHaveBeenCalled();
    });
    it("should assign the correct context menu options based on the type of highlight", () => {
      SectionsManager._addCardTypeLinkMenuOptions =
        addCardTypeLinkMenuOptionsOrig;

      SectionsManager.updateSection("highlights", { rows: FAKE_ROWS }, false);
      const highlights = SectionsManager.sections.get("highlights").FAKE_ROWS;

      // FAKE_ROWS was added in the following order: bookmark, pocket, history
      expect(highlights[0].contextMenuOptions).toEqual(
        SectionsManager.CONTEXT_MENU_OPTIONS_FOR_HIGHLIGHT_TYPES.bookmark
      );
      expect(highlights[1].contextMenuOptions).toEqual(
        SectionsManager.CONTEXT_MENU_OPTIONS_FOR_HIGHLIGHT_TYPES.pocket
      );
      expect(highlights[2].contextMenuOptions).toEqual(
        SectionsManager.CONTEXT_MENU_OPTIONS_FOR_HIGHLIGHT_TYPES.history
      );
    });
    it("should throw an error if you are assigning a context menu to a non-existant highlight type", () => {
      const consoleError = silenceConsoleError();
      SectionsManager.updateSection(
        "highlights",
        { rows: [{ url: "foo", type: "badtype" }] },
        false
      );
      const highlights = SectionsManager.sections.get("highlights").rows;
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(highlights[0].contextMenuOptions).toBeUndefined();
      consoleError.mockRestore();
    });
    it("should filter out context menu options that are in CONTEXT_MENU_PREFS", () => {
      fakeServices.prefs.getBoolPref.mockImplementation(
        o => SectionsManager.CONTEXT_MENU_PREFS[o] !== "RemoveMe"
      );
      SectionsManager.CONTEXT_MENU_PREFS = { RemoveMe: "RemoveMe" };
      SectionsManager.CONTEXT_MENU_OPTIONS_FOR_HIGHLIGHT_TYPES = {
        bookmark: ["KeepMe", "RemoveMe"],
        pocket: ["KeepMe", "RemoveMe"],
        history: ["KeepMe", "RemoveMe"],
      };
      SectionsManager.updateSection("highlights", { rows: FAKE_ROWS }, false);
      const highlights = SectionsManager.sections.get("highlights").FAKE_ROWS;

      // Only keep context menu options that were not supposed to be removed based on CONTEXT_MENU_PREFS
      expect(highlights[0].contextMenuOptions).toEqual(["KeepMe"]);
      expect(highlights[1].contextMenuOptions).toEqual(["KeepMe"]);
      expect(highlights[2].contextMenuOptions).toEqual(["KeepMe"]);
      SectionsManager.CONTEXT_MENU_OPTIONS_FOR_HIGHLIGHT_TYPES =
        contextMenuOptionsOrig;
    });
  });
  describe("#onceInitialized", () => {
    it("should call the callback immediately if SectionsManager is initialised", () => {
      SectionsManager.initialized = true;
      const callback = jest.fn();
      SectionsManager.onceInitialized(callback);
      expect(callback).toHaveBeenCalledTimes(1);
    });
    it("should bind the callback to .once(INIT) if SectionsManager is not initialised", () => {
      SectionsManager.initialized = false;
      jest.spyOn(SectionsManager, "once");
      const callback = () => {};
      SectionsManager.onceInitialized(callback);
      expect(SectionsManager.once).toHaveBeenCalledTimes(1);
      expect(SectionsManager.once).toHaveBeenCalledWith(
        SectionsManager.INIT,
        callback
      );
    });
  });
  describe("#updateSectionCard", () => {
    it("should emit an UPDATE_SECTION_CARD event with correct arguments", () => {
      SectionsManager.addSection(
        FAKE_ID,
        Object.assign({}, FAKE_OPTIONS, { rows: FAKE_ROWS })
      );
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.UPDATE_SECTION_CARD, spy);
      SectionsManager.updateSectionCard(
        FAKE_ID,
        FAKE_URL,
        FAKE_CARD_OPTIONS,
        true
      );
      expect(spy).toHaveBeenCalledTimes(1);
      // The trailing `false` is updateSectionCard's isStartup default.
      expect(spy).toHaveBeenCalledWith(
        SectionsManager.UPDATE_SECTION_CARD,
        FAKE_ID,
        FAKE_URL,
        FAKE_CARD_OPTIONS,
        true,
        false
      );
    });
    it("should do nothing if the section doesn't exist", () => {
      SectionsManager.removeSection(FAKE_ID);
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.UPDATE_SECTION_CARD, spy);
      SectionsManager.updateSectionCard(
        FAKE_ID,
        FAKE_URL,
        FAKE_CARD_OPTIONS,
        true
      );
      expect(spy).not.toHaveBeenCalled();
    });
  });
  describe("#removeSectionCard", () => {
    it("should dispatch an SECTION_UPDATE action in which cards corresponding to the given url are removed", () => {
      const rows = [{ url: "foo.com" }, { url: "bar.com" }];

      SectionsManager.addSection(
        FAKE_ID,
        Object.assign({}, FAKE_OPTIONS, { rows })
      );
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.UPDATE_SECTION, spy);
      SectionsManager.removeSectionCard(FAKE_ID, "foo.com");

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][1]).toBe(FAKE_ID);
      expect(spy.mock.calls[0][2].rows).toEqual([{ url: "bar.com" }]);
    });
    it("should do nothing if the section doesn't exist", () => {
      SectionsManager.removeSection(FAKE_ID);
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.UPDATE_SECTION, spy);
      SectionsManager.removeSectionCard(FAKE_ID, "bar.com");
      expect(spy).not.toHaveBeenCalled();
    });
  });
  describe("#updateBookmarkMetadata", () => {
    beforeEach(() => {
      let rows = [
        {
          url: "bar",
          title: "title",
          description: "description",
          image: "image",
          type: "trending",
        },
      ];
      SectionsManager.addSection("topstories", { rows });
      // Simulate 2 sections.
      rows = [
        {
          url: "foo",
          title: "title",
          description: "description",
          image: "image",
          type: "bookmark",
        },
      ];
      SectionsManager.addSection("highlights", { rows });
    });

    it("shouldn't call PlacesUtils if URL is not in topstories", () => {
      SectionsManager.updateBookmarkMetadata({ url: "foo" });

      expect(fakePlacesUtils.history.update).not.toHaveBeenCalled();
    });
    it("should call PlacesUtils.history.update", () => {
      SectionsManager.updateBookmarkMetadata({ url: "bar" });

      expect(fakePlacesUtils.history.update).toHaveBeenCalledTimes(1);
      expect(fakePlacesUtils.history.update).toHaveBeenCalledWith({
        url: "bar",
        title: "title",
        description: "description",
        previewImageURL: "image",
      });
    });
    it("should call PlacesUtils.history.insert", () => {
      SectionsManager.updateBookmarkMetadata({ url: "bar" });

      expect(fakePlacesUtils.history.insert).toHaveBeenCalledTimes(1);
      expect(fakePlacesUtils.history.insert).toHaveBeenCalledWith({
        url: "bar",
        title: "title",
        visits: [{}],
      });
    });
  });
});

describe("SectionsFeed", () => {
  let feed;
  let restoreGlobals;

  beforeEach(() => {
    SectionsManager.sections.clear();
    SectionsManager.initialized = false;
    restoreGlobals = stubGlobals({
      // Karma got Services for free from its global test environment; here the
      // SectionsManager suite's stub is already restored, so stub it again.
      Services: mockServices(["prefs"]),
      NimbusFeatures: {
        newtab: { getAllVariables: jest.fn() },
        pocketNewtab: { getAllVariables: jest.fn() },
      },
    });
    feed = new SectionsFeed();
    feed.store = { dispatch: jest.fn() };
    feed.store = {
      dispatch: jest.fn(),
      getState() {
        return this.state;
      },
      state: {
        Prefs: {
          values: {
            sectionOrder: "topsites,topstories,highlights",
            "feeds.topsites": true,
          },
        },
        Sections: [{ initialized: false }],
      },
    };
  });
  afterEach(() => {
    feed.uninit();
    restoreGlobals();
    jest.restoreAllMocks();
  });
  describe("#init", () => {
    it("should create a SectionsFeed", () => {
      expect(feed).toBeInstanceOf(SectionsFeed);
    });
    it("should bind appropriate listeners", () => {
      jest.spyOn(SectionsManager, "on");
      feed.init();
      expect(SectionsManager.on).toHaveBeenCalledTimes(4);
      for (const [event, listener] of [
        [SectionsManager.ADD_SECTION, feed.onAddSection],
        [SectionsManager.REMOVE_SECTION, feed.onRemoveSection],
        [SectionsManager.UPDATE_SECTION, feed.onUpdateSection],
        [SectionsManager.UPDATE_SECTION_CARD, feed.onUpdateSectionCard],
      ]) {
        expect(SectionsManager.on).toHaveBeenCalledWith(event, listener);
      }
    });
    it("should call onAddSection for any already added sections in SectionsManager", async () => {
      await SectionsManager.init({});
      expect(SectionsManager.sections.has("topstories")).toBeTruthy();
      expect(SectionsManager.sections.has("highlights")).toBeTruthy();
      const topstories = SectionsManager.sections.get("topstories");
      const highlights = SectionsManager.sections.get("highlights");
      jest.spyOn(feed, "onAddSection");
      feed.init();
      expect(feed.onAddSection).toHaveBeenCalledTimes(2);
      // The trailing `true` is the isStartup flag init() passes.
      expect(feed.onAddSection).toHaveBeenCalledWith(
        SectionsManager.ADD_SECTION,
        "topstories",
        topstories,
        true
      );
      expect(feed.onAddSection).toHaveBeenCalledWith(
        SectionsManager.ADD_SECTION,
        "highlights",
        highlights,
        true
      );
    });
  });
  describe("#uninit", () => {
    it("should unbind all listeners", () => {
      jest.spyOn(SectionsManager, "off");
      feed.init();
      feed.uninit();
      expect(SectionsManager.off).toHaveBeenCalledTimes(4);
      for (const [event, listener] of [
        [SectionsManager.ADD_SECTION, feed.onAddSection],
        [SectionsManager.REMOVE_SECTION, feed.onRemoveSection],
        [SectionsManager.UPDATE_SECTION, feed.onUpdateSection],
        [SectionsManager.UPDATE_SECTION_CARD, feed.onUpdateSectionCard],
      ]) {
        expect(SectionsManager.off).toHaveBeenCalledWith(event, listener);
      }
    });
    it("should emit an UNINIT event and set SectionsManager.initialized to false", () => {
      const spy = jest.fn();
      SectionsManager.on(SectionsManager.UNINIT, spy);
      feed.init();
      feed.uninit();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(SectionsManager.initialized).toBeFalsy();
    });
  });
  describe("#onAddSection", () => {
    it("should broadcast a SECTION_REGISTER action with the correct data", () => {
      feed.onAddSection(null, FAKE_ID, FAKE_OPTIONS);
      const [[action]] = feed.store.dispatch.mock.calls;
      expect(action.type).toBe("SECTION_REGISTER");
      expect(action.data).toEqual(Object.assign({ id: FAKE_ID }, FAKE_OPTIONS));
      expect(action.meta.from).toBe(MAIN_MESSAGE_TYPE);
      expect(action.meta.to).toBe(CONTENT_MESSAGE_TYPE);
    });
    it("should prepend id to sectionOrder pref if not already included", () => {
      feed.store.state.Sections = [
        { id: "topstories", enabled: true },
        { id: "highlights", enabled: true },
      ];
      feed.onAddSection(null, FAKE_ID, FAKE_OPTIONS);
      expect(feed.store.dispatch).toHaveBeenCalledWith({
        data: {
          name: "sectionOrder",
          value: `${FAKE_ID},topsites,topstories,highlights`,
        },
        meta: { from: "ActivityStream:Content", to: "ActivityStream:Main" },
        type: "SET_PREF",
      });
    });
  });
  describe("#onRemoveSection", () => {
    it("should broadcast a SECTION_DEREGISTER action with the correct data", () => {
      feed.onRemoveSection(null, FAKE_ID);
      const [[action]] = feed.store.dispatch.mock.calls;
      expect(action.type).toBe("SECTION_DEREGISTER");
      expect(action.data).toEqual(FAKE_ID);
      // Should be broadcast
      expect(action.meta.from).toBe(MAIN_MESSAGE_TYPE);
      expect(action.meta.to).toBe(CONTENT_MESSAGE_TYPE);
    });
  });
  describe("#onUpdateSection", () => {
    it("should do nothing if no options are provided", () => {
      feed.onUpdateSection(null, FAKE_ID, null);
      expect(feed.store.dispatch).not.toHaveBeenCalled();
    });
    it("should dispatch a SECTION_UPDATE action with the correct data", () => {
      feed.onUpdateSection(null, FAKE_ID, { rows: FAKE_ROWS });
      const [[action]] = feed.store.dispatch.mock.calls;
      expect(action.type).toBe("SECTION_UPDATE");
      expect(action.data).toEqual({ id: FAKE_ID, rows: FAKE_ROWS });
      // Should be not broadcast by default, but should update the preloaded tab, so check meta
      expect(action.meta.from).toBe(MAIN_MESSAGE_TYPE);
      expect(action.meta.to).toBe(PRELOAD_MESSAGE_TYPE);
    });
    it("should broadcast the action only if shouldBroadcast is true", () => {
      feed.onUpdateSection(null, FAKE_ID, { rows: FAKE_ROWS }, true);
      const [[action]] = feed.store.dispatch.mock.calls;
      // Should be broadcast
      expect(action.meta.from).toBe(MAIN_MESSAGE_TYPE);
      expect(action.meta.to).toBe(CONTENT_MESSAGE_TYPE);
    });
  });
  describe("#onUpdateSectionCard", () => {
    it("should do nothing if no options are provided", () => {
      feed.onUpdateSectionCard(null, FAKE_ID, FAKE_URL, null);
      expect(feed.store.dispatch).not.toHaveBeenCalled();
    });
    it("should dispatch a SECTION_UPDATE_CARD action with the correct data", () => {
      feed.onUpdateSectionCard(null, FAKE_ID, FAKE_URL, FAKE_CARD_OPTIONS);
      const [[action]] = feed.store.dispatch.mock.calls;
      expect(action.type).toBe("SECTION_UPDATE_CARD");
      expect(action.data).toEqual({
        id: FAKE_ID,
        url: FAKE_URL,
        options: FAKE_CARD_OPTIONS,
      });
      // Should be not broadcast by default, but should update the preloaded tab, so check meta
      expect(action.meta.from).toBe(MAIN_MESSAGE_TYPE);
      expect(action.meta.to).toBe(PRELOAD_MESSAGE_TYPE);
    });
    it("should broadcast the action only if shouldBroadcast is true", () => {
      feed.onUpdateSectionCard(
        null,
        FAKE_ID,
        FAKE_URL,
        FAKE_CARD_OPTIONS,
        true
      );
      const [[action]] = feed.store.dispatch.mock.calls;
      // Should be broadcast
      expect(action.meta.from).toBe(MAIN_MESSAGE_TYPE);
      expect(action.meta.to).toBe(CONTENT_MESSAGE_TYPE);
    });
  });
  describe("#onAction", () => {
    it("should bind this.init to SectionsManager.INIT on INIT", () => {
      jest.spyOn(SectionsManager, "once");
      feed.onAction({ type: "INIT" });
      expect(SectionsManager.once).toHaveBeenCalledTimes(1);
      expect(SectionsManager.once).toHaveBeenCalledWith(
        SectionsManager.INIT,
        feed.init
      );
    });
    it("should call SectionsManager.addBuiltInSection on suitable PREF_CHANGED events", () => {
      // "foo" isn't valid JSON, so addBuiltInSection logs a parse error.
      const consoleError = silenceConsoleError();
      jest.spyOn(SectionsManager, "addBuiltInSection");
      feed.onAction({
        type: "PREF_CHANGED",
        data: { name: "feeds.section.topstories.options", value: "foo" },
      });
      expect(SectionsManager.addBuiltInSection).toHaveBeenCalledTimes(1);
      expect(SectionsManager.addBuiltInSection).toHaveBeenCalledWith(
        "feeds.section.topstories",
        "foo"
      );
      consoleError.mockRestore();
    });
    it("should fire SECTION_OPTIONS_UPDATED on suitable PREF_CHANGED events", async () => {
      const consoleError = silenceConsoleError();
      await feed.onAction({
        type: "PREF_CHANGED",
        data: { name: "feeds.section.topstories.options", value: "foo" },
      });
      expect(feed.store.dispatch).toHaveBeenCalledTimes(1);
      const [[action]] = feed.store.dispatch.mock.calls;
      expect(action.type).toBe("SECTION_OPTIONS_CHANGED");
      expect(action.data).toBe("topstories");
      consoleError.mockRestore();
    });
    it("should call SectionsManager.disableSection on SECTION_DISABLE", () => {
      jest.spyOn(SectionsManager, "disableSection");
      feed.onAction({ type: "SECTION_DISABLE", data: 1234 });
      expect(SectionsManager.disableSection).toHaveBeenCalledTimes(1);
      expect(SectionsManager.disableSection).toHaveBeenCalledWith(1234);
      SectionsManager.disableSection.mockRestore();
    });
    it("should call SectionsManager.enableSection on SECTION_ENABLE", () => {
      jest.spyOn(SectionsManager, "enableSection");
      feed.onAction({ type: "SECTION_ENABLE", data: 1234 });
      expect(SectionsManager.enableSection).toHaveBeenCalledTimes(1);
      expect(SectionsManager.enableSection).toHaveBeenCalledWith(1234);
      SectionsManager.enableSection.mockRestore();
    });
    it("should call the feed's uninit on UNINIT", () => {
      jest.spyOn(feed, "uninit").mockImplementation(() => {});

      feed.onAction({ type: "UNINIT" });

      expect(feed.uninit).toHaveBeenCalledTimes(1);
    });
    it("should emit a ACTION_DISPATCHED event and forward any action in ACTIONS_TO_PROXY if there are any sections", () => {
      const spy = jest.fn();
      const allowedActions = SectionsManager.ACTIONS_TO_PROXY;
      const disallowedActions = ["PREF_CHANGED", "OPEN_PRIVATE_WINDOW"];
      feed.init();
      SectionsManager.on(SectionsManager.ACTION_DISPATCHED, spy);
      // Make sure we start with no sections - no event should be emitted
      SectionsManager.sections.clear();
      feed.onAction({ type: allowedActions[0] });
      expect(spy).not.toHaveBeenCalled();
      // Then add a section and check correct behaviour
      SectionsManager.addSection(FAKE_ID, FAKE_OPTIONS);
      for (const action of allowedActions.concat(disallowedActions)) {
        feed.onAction({ type: action });
      }
      for (const action of allowedActions) {
        expect(spy).toHaveBeenCalledWith(
          "ACTION_DISPATCHED",
          action,
          undefined
        );
      }
      for (const action of disallowedActions) {
        expect(spy).not.toHaveBeenCalledWith(
          "ACTION_DISPATCHED",
          action,
          undefined
        );
      }
    });
    it("should call updateBookmarkMetadata on PLACES_BOOKMARK_ADDED", () => {
      const stub = jest
        .spyOn(SectionsManager, "updateBookmarkMetadata")
        .mockImplementation(() => {});

      feed.onAction({ type: "PLACES_BOOKMARK_ADDED", data: {} });

      expect(stub).toHaveBeenCalledTimes(1);
    });
    it("should call SectionManager.removeSectionCard on WEBEXT_DISMISS", () => {
      const stub = jest
        .spyOn(SectionsManager, "removeSectionCard")
        .mockImplementation(() => {});

      feed.onAction(
        ac.WebExtEvent(at.WEBEXT_DISMISS, { source: "Foo", url: "bar.com" })
      );

      expect(stub).toHaveBeenCalledTimes(1);
      expect(stub).toHaveBeenCalledWith("Foo", "bar.com");
    });
  });
});
