import { ASRouterTriggerListeners } from "modules/ASRouterTriggerListeners.sys.mjs";
import { ASRouterPreferences } from "modules/ASRouterPreferences.sys.mjs";
import { GlobalOverrider } from "tests/unit/utils";

describe("ASRouterTriggerListeners", () => {
  let sandbox;
  let globals;
  let existingWindow;
  let isWindowPrivateStub;
  const triggerHandler = () => {};
  const openURLListener = ASRouterTriggerListeners.get("openURL");
  const frequentVisitsListener = ASRouterTriggerListeners.get("frequentVisits");
  const captivePortalLoginListener =
    ASRouterTriggerListeners.get("captivePortalLogin");
  const bookmarkAddedListener = ASRouterTriggerListeners.get("bookmarkAdded");
  const bookmarkedURLListener =
    ASRouterTriggerListeners.get("openBookmarkedURL");
  const visitBookmarkedURLListener =
    ASRouterTriggerListeners.get("visitBookmarkedURL");
  const openArticleURLListener = ASRouterTriggerListeners.get("openArticleURL");
  const nthTabClosedListener = ASRouterTriggerListeners.get("nthTabClosed");
  const idleListener = ASRouterTriggerListeners.get("activityAfterIdle");
  const formAutofillListener = ASRouterTriggerListeners.get("formAutofill");
  const hosts = ["www.mozilla.com", "www.mozilla.org"];
  const regexPatterns = ["mozilla"];

  const regionFake = {
    _home: "cn",
    _current: "cn",
    get home() {
      return this._home;
    },
    get current() {
      return this._current;
    },
  };

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    globals = new GlobalOverrider();
    existingWindow = {
      gBrowser: {
        addTabsProgressListener: sandbox.stub(),
        removeTabsProgressListener: sandbox.stub(),
        currentURI: { host: "", regexPattern: "" },
      },
      addEventListener: sinon.stub(),
      removeEventListener: sinon.stub(),
    };
    sandbox.spy(openURLListener, "init");
    sandbox.spy(openURLListener, "uninit");
    isWindowPrivateStub = sandbox.stub();
    // Assume no window is private so that we execute the action
    isWindowPrivateStub.returns(false);
    globals.set("PrivateBrowsingUtils", {
      isWindowPrivate: isWindowPrivateStub,
    });
    const ewUninit = new Map();
    globals.set("EveryWindow", {
      registerCallback: (id, init, uninit) => {
        init(existingWindow);
        ewUninit.set(id, uninit);
      },
      unregisterCallback: id => {
        ewUninit.get(id)(existingWindow);
      },
    });
    globals.set("Region", regionFake);
    globals.set("ASRouterPreferences", ASRouterPreferences);
  });

  afterEach(() => {
    sandbox.restore();
    globals.restore();
  });

  const PLACES_BOOKMARKS = {
    TYPE_BOOKMARK: 1,
    TYPE_FOLDER: 2,
    SOURCES: {
      DEFAULT: 0,
      SYNC: 1,
      IMPORT: 2,
      SYNC_REPARENT_REMOVED_FOLDER_CHILDREN: 4,
      RESTORE: 5,
      RESTORE_ON_STARTUP: 6,
    },
  };
  const bookmarkAddedEvent = props => ({
    itemType: PLACES_BOOKMARKS.TYPE_BOOKMARK,
    isTagging: false,
    source: PLACES_BOOKMARKS.SOURCES.DEFAULT,
    ...props,
  });

  describe("bookmarkAdded", () => {
    let addListenerStub;
    let removeListenerStub;
    let selectedBrowser;
    beforeEach(() => {
      addListenerStub = sandbox.stub();
      removeListenerStub = sandbox.stub();
      selectedBrowser = {};
      globals.set("PlacesUtils", {
        observers: {
          addListener: addListenerStub,
          removeListener: removeListenerStub,
        },
        bookmarks: PLACES_BOOKMARKS,
      });
      sandbox
        .stub(global.Services.wm, "getMostRecentBrowserWindow")
        .returns({ gBrowser: { selectedBrowser } });
    });
    afterEach(() => {
      bookmarkAddedListener.uninit();
    });
    it("should add a bookmark-added listener on init", () => {
      bookmarkAddedListener.init(sandbox.stub());

      assert.calledOnce(addListenerStub);
      assert.calledWithExactly(
        addListenerStub,
        ["bookmark-added"],
        bookmarkAddedListener.handlePlacesEvents
      );
    });
    it("should remove the listener on uninit", () => {
      bookmarkAddedListener.init(sandbox.stub());
      const { handlePlacesEvents } = bookmarkAddedListener;
      bookmarkAddedListener.uninit();

      assert.calledOnce(removeListenerStub);
      assert.calledWithExactly(
        removeListenerStub,
        ["bookmark-added"],
        handlePlacesEvents
      );
    });
    it("should provide id to triggerHandler for a user bookmark add", () => {
      const triggerHandlerStub = sandbox.stub();
      bookmarkAddedListener.init(triggerHandlerStub);

      bookmarkAddedListener.handlePlacesEvents([bookmarkAddedEvent()]);

      assert.calledOnce(triggerHandlerStub);
      assert.calledWithExactly(triggerHandlerStub, selectedBrowser, {
        id: "bookmarkAdded",
      });
    });
    it("should fire only once per notification batch", () => {
      const triggerHandlerStub = sandbox.stub();
      bookmarkAddedListener.init(triggerHandlerStub);

      bookmarkAddedListener.handlePlacesEvents([
        bookmarkAddedEvent(),
        bookmarkAddedEvent(),
        bookmarkAddedEvent(),
      ]);

      assert.calledOnce(triggerHandlerStub);
    });
    it("should ignore folders, tag operations and bulk sources", () => {
      const triggerHandlerStub = sandbox.stub();
      bookmarkAddedListener.init(triggerHandlerStub);

      bookmarkAddedListener.handlePlacesEvents([
        bookmarkAddedEvent({ itemType: PLACES_BOOKMARKS.TYPE_FOLDER }),
        bookmarkAddedEvent({ isTagging: true }),
        bookmarkAddedEvent({ source: PLACES_BOOKMARKS.SOURCES.IMPORT }),
        bookmarkAddedEvent({ source: PLACES_BOOKMARKS.SOURCES.SYNC }),
        bookmarkAddedEvent({ source: PLACES_BOOKMARKS.SOURCES.RESTORE }),
      ]);

      assert.notCalled(triggerHandlerStub);
    });
    it("should not fire in a private window", () => {
      const triggerHandlerStub = sandbox.stub();
      isWindowPrivateStub.returns(true);
      bookmarkAddedListener.init(triggerHandlerStub);

      bookmarkAddedListener.handlePlacesEvents([bookmarkAddedEvent()]);

      assert.notCalled(triggerHandlerStub);
    });
  });

  describe("openBookmarkedURL", () => {
    let observerStub;
    describe("#init", () => {
      beforeEach(() => {
        observerStub = sandbox.stub(global.Services.obs, "addObserver");
        sandbox
          .stub(global.Services.wm, "getMostRecentBrowserWindow")
          .returns({ gBrowser: { selectedBrowser: {} } });
      });
      afterEach(() => {
        bookmarkedURLListener.uninit();
      });
      it("should set hosts to the recentBookmarks", async () => {
        await bookmarkedURLListener.init(sandbox.stub());

        assert.calledOnce(observerStub);
        assert.calledWithExactly(
          observerStub,
          bookmarkedURLListener,
          "bookmark-icon-updated"
        );
      });
      it("should provide id to triggerHandler", async () => {
        const newTriggerHandler = sinon.stub();
        const subject = {};
        await bookmarkedURLListener.init(newTriggerHandler);

        bookmarkedURLListener.observe(
          subject,
          "bookmark-icon-updated",
          "starred"
        );

        assert.calledOnce(newTriggerHandler);
        assert.calledWithExactly(newTriggerHandler, subject, {
          id: bookmarkedURLListener.id,
        });
      });
    });
  });

  describe("visitBookmarkedURL", () => {
    let fetchStub;
    const webProgress = { isTopLevel: true };
    const aLocationURI = { spec: "https://www.mozilla.org/" };
    beforeEach(() => {
      fetchStub = sandbox.stub().resolves(null);
      globals.set("PlacesUtils", {
        bookmarks: { fetch: fetchStub },
      });
    });
    afterEach(() => {
      visitBookmarkedURLListener.uninit();
    });

    it("should add tab progress listeners on init", () => {
      visitBookmarkedURLListener.init(sandbox.stub());

      assert.calledOnce(existingWindow.gBrowser.addTabsProgressListener);
      assert.calledWithExactly(
        existingWindow.gBrowser.addTabsProgressListener,
        visitBookmarkedURLListener
      );
    });
    it("should remove tab progress listeners on uninit", () => {
      visitBookmarkedURLListener.init(sandbox.stub());
      visitBookmarkedURLListener.uninit();

      assert.calledOnce(existingWindow.gBrowser.removeTabsProgressListener);
      assert.calledWithExactly(
        existingWindow.gBrowser.removeTabsProgressListener,
        visitBookmarkedURLListener
      );
    });
    it("should fire when navigating to a bookmarked URL", async () => {
      fetchStub.resolves({ guid: "bookmark-guid" });
      const triggerHandlerStub = sandbox.stub();
      visitBookmarkedURLListener.init(triggerHandlerStub);
      const browser = {};

      await visitBookmarkedURLListener.onLocationChange(
        browser,
        webProgress,
        undefined,
        aLocationURI,
        0
      );

      assert.calledWithExactly(fetchStub, { url: aLocationURI });
      assert.calledOnce(triggerHandlerStub);
      assert.calledWithExactly(triggerHandlerStub, browser, {
        id: "visitBookmarkedURL",
      });
    });
    it("should not fire when the URL is not bookmarked", async () => {
      const triggerHandlerStub = sandbox.stub();
      visitBookmarkedURLListener.init(triggerHandlerStub);

      await visitBookmarkedURLListener.onLocationChange(
        {},
        webProgress,
        undefined,
        aLocationURI,
        0
      );

      assert.notCalled(triggerHandlerStub);
    });
    it("should not fire for same-document navigations", async () => {
      fetchStub.resolves({ guid: "bookmark-guid" });
      const triggerHandlerStub = sandbox.stub();
      visitBookmarkedURLListener.init(triggerHandlerStub);

      await visitBookmarkedURLListener.onLocationChange(
        {},
        webProgress,
        undefined,
        aLocationURI,
        Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
      );

      assert.notCalled(fetchStub);
      assert.notCalled(triggerHandlerStub);
    });
    it("should not fire when fetch throws for an unnormalisable URL", async () => {
      fetchStub.rejects(new Error("invalid url"));
      const triggerHandlerStub = sandbox.stub();
      visitBookmarkedURLListener.init(triggerHandlerStub);

      await visitBookmarkedURLListener.onLocationChange(
        {},
        webProgress,
        undefined,
        aLocationURI,
        0
      );

      assert.notCalled(triggerHandlerStub);
    });
  });

  describe("captivePortal", () => {
    describe("observe", () => {
      it("should not call the trigger handler if _shouldShowCaptivePortalVPNPromo returns false", () => {
        sandbox
          .stub(captivePortalLoginListener, "_shouldShowCaptivePortalVPNPromo")
          .returns(false);
        captivePortalLoginListener._triggerHandler = sandbox.spy();

        captivePortalLoginListener.observe(
          null,
          "captive-portal-login-success"
        );

        assert.notCalled(captivePortalLoginListener._triggerHandler);
      });

      it("should call the trigger handler if _shouldShowCaptivePortalVPNPromo returns true", () => {
        sandbox
          .stub(captivePortalLoginListener, "_shouldShowCaptivePortalVPNPromo")
          .returns(true);
        sandbox.stub(Services.wm, "getMostRecentBrowserWindow").returns({
          gBrowser: {
            selectedBrowser: true,
          },
        });
        captivePortalLoginListener._triggerHandler = sandbox.spy();

        captivePortalLoginListener.observe(
          null,
          "captive-portal-login-success"
        );

        assert.calledOnce(captivePortalLoginListener._triggerHandler);
      });
    });
  });

  describe("openArticleURL", () => {
    describe("#init", () => {
      beforeEach(() => {
        globals.set(
          "MatchPatternSet",
          sandbox.stub().callsFake(patterns => ({
            patterns,
            matches: url => patterns.has(url),
          }))
        );
        sandbox.stub(global.AboutReaderParent, "addMessageListener");
        sandbox.stub(global.AboutReaderParent, "removeMessageListener");
      });
      afterEach(() => {
        openArticleURLListener.uninit();
      });
      it("setup an event listener on init", () => {
        openArticleURLListener.init(sandbox.stub(), hosts, hosts);

        assert.calledOnce(global.AboutReaderParent.addMessageListener);
        assert.calledWithExactly(
          global.AboutReaderParent.addMessageListener,
          openArticleURLListener.readerModeEvent,
          sinon.match.object
        );
      });
      it("should call triggerHandler correctly for matches [host match]", () => {
        const stub = sandbox.stub();
        const target = { currentURI: { host: hosts[0], spec: hosts[1] } };
        openArticleURLListener.init(stub, hosts, hosts);

        const [, { receiveMessage }] =
          global.AboutReaderParent.addMessageListener.firstCall.args;
        receiveMessage({ data: { isArticle: true }, target });

        assert.calledOnce(stub);
        assert.calledWithExactly(stub, target, {
          id: openArticleURLListener.id,
          param: { host: hosts[0], url: hosts[1] },
        });
      });
      it("should call triggerHandler correctly for matches [pattern match]", () => {
        const stub = sandbox.stub();
        const target = { currentURI: { host: null, spec: hosts[1] } };
        openArticleURLListener.init(stub, hosts, hosts);

        const [, { receiveMessage }] =
          global.AboutReaderParent.addMessageListener.firstCall.args;
        receiveMessage({ data: { isArticle: true }, target });

        assert.calledOnce(stub);
        assert.calledWithExactly(stub, target, {
          id: openArticleURLListener.id,
          param: { host: null, url: hosts[1] },
        });
      });
      it("should match URL using regexPatterns", () => {
        const stub = sandbox.stub();

        const target = { currentURI: { host: null, spec: hosts[1] } };

        // match exactly the string "mozilla"
        openArticleURLListener.init(stub, [], [], ["mozilla"]);

        const [, { receiveMessage }] =
          global.AboutReaderParent.addMessageListener.firstCall.args;
        receiveMessage({ data: { isArticle: true }, target });

        assert.calledOnce(stub);
        assert.calledWithExactly(stub, target, {
          id: openArticleURLListener.id,
          param: { host: null, url: hosts[1] },
        });
      });
      it("should remove the message listener", () => {
        openArticleURLListener.init(sandbox.stub(), hosts, hosts);
        openArticleURLListener.uninit();

        assert.calledOnce(global.AboutReaderParent.removeMessageListener);
      });
    });
  });

  describe("frequentVisits", () => {
    let _triggerHandler;
    beforeEach(() => {
      globals.set(
        "MatchPatternSet",
        sandbox.stub().callsFake(patterns => ({
          patterns,
          matches: url => patterns.has(url),
        }))
      );

      _triggerHandler = sandbox.stub();
      sandbox.useFakeTimers();
      frequentVisitsListener.init(_triggerHandler, hosts, [], regexPatterns);
    });
    afterEach(() => {
      sandbox.clock.restore();
      frequentVisitsListener.uninit();
    });
    it("should be initialized", () => {
      assert.isTrue(frequentVisitsListener._initialized);
    });
    it("should listen for TabSelect events", () => {
      assert.calledOnce(existingWindow.addEventListener);
      assert.calledWith(
        existingWindow.addEventListener,
        "TabSelect",
        frequentVisitsListener.onTabSwitch
      );
    });
    it("should call _triggerHandler if the visit is valid (is recoreded)", () => {
      frequentVisitsListener.triggerHandler({}, "www.mozilla.com");

      assert.calledOnce(_triggerHandler);
    });
    it("should call _triggerHandler only once", () => {
      frequentVisitsListener.triggerHandler({}, "www.mozilla.com");
      frequentVisitsListener.triggerHandler({}, "www.mozilla.com");

      assert.calledOnce(_triggerHandler);
    });
    it("should call _triggerHandler again after 15 minutes", () => {
      frequentVisitsListener.triggerHandler({}, "www.mozilla.com");
      sandbox.clock.tick(15 * 60 * 1000 + 1);
      frequentVisitsListener.triggerHandler({}, "www.mozilla.com");

      assert.calledTwice(_triggerHandler);
    });
    it("should call triggerHandler on valid hosts", () => {
      const stub = sandbox.stub(frequentVisitsListener, "triggerHandler");
      existingWindow.gBrowser.currentURI.host = hosts[0]; // eslint-disable-line prefer-destructuring

      frequentVisitsListener.onTabSwitch({
        target: { documentGlobal: existingWindow },
      });

      assert.calledOnce(stub);
    });
    it("should not call triggerHandler on invalid hosts", () => {
      const stub = sandbox.stub(frequentVisitsListener, "triggerHandler");
      existingWindow.gBrowser.currentURI.host = "foo.com";

      frequentVisitsListener.onTabSwitch({
        target: { documentGlobal: existingWindow },
      });

      assert.notCalled(stub);
    });
    it("should call triggerHandler when regexPatterns match", () => {
      const stub = sandbox.stub(frequentVisitsListener, "triggerHandler");

      existingWindow.gBrowser.currentURI = {
        host: "www.example.com",
        spec: "https://www.mozilla.org",
      };

      frequentVisitsListener.onTabSwitch({
        target: { documentGlobal: existingWindow },
      });

      assert.calledOnce(stub);
    });

    describe("MatchPattern", () => {
      beforeEach(() => {
        globals.set(
          "MatchPatternSet",
          sandbox.stub().callsFake(patterns => ({ patterns: patterns || [] }))
        );
      });
      afterEach(() => {
        frequentVisitsListener.uninit();
      });
      it("should create a matchPatternSet", () => {
        frequentVisitsListener.init(_triggerHandler, hosts, ["pattern"]);

        assert.calledOnce(window.MatchPatternSet);
        assert.calledWithExactly(
          window.MatchPatternSet,
          new Set(["pattern"]),
          undefined
        );
      });
      it("should allow to add multiple patterns and dedupe", () => {
        frequentVisitsListener.init(_triggerHandler, hosts, ["pattern"]);
        frequentVisitsListener.init(_triggerHandler, hosts, ["foo"]);

        assert.calledTwice(window.MatchPatternSet);
        assert.calledWithExactly(
          window.MatchPatternSet,
          new Set(["pattern", "foo"]),
          undefined
        );
      });
      it("should handle bad arguments to MatchPatternSet", () => {
        const badArgs = ["www.example.com"];
        window.MatchPatternSet.withArgs(new Set(badArgs)).throws();
        frequentVisitsListener.init(_triggerHandler, hosts, badArgs);

        // Fails with an empty MatchPatternSet
        assert.property(frequentVisitsListener._matchPatternSet, "patterns");

        // Second try is succesful
        frequentVisitsListener.init(_triggerHandler, hosts, ["foo"]);

        assert.property(frequentVisitsListener._matchPatternSet, "patterns");
        assert.isTrue(
          frequentVisitsListener._matchPatternSet.patterns.has("foo")
        );
      });
    });
  });

  describe("nthTabClosed", () => {
    describe("#init", () => {
      beforeEach(() => {
        nthTabClosedListener.init(triggerHandler);
      });
      afterEach(() => {
        nthTabClosedListener.uninit();
      });

      it("should set ._initialized to true and save the triggerHandler", () => {
        assert.ok(nthTabClosedListener._initialized);
        assert.equal(nthTabClosedListener._triggerHandler, triggerHandler);
      });

      it("if already initialised, it should only update the trigger handler", () => {
        const newTriggerHandler = () => {};
        nthTabClosedListener.init(newTriggerHandler);
        assert.ok(nthTabClosedListener._initialized);
        assert.equal(nthTabClosedListener._triggerHandler, newTriggerHandler);
      });

      it("should add an event listeners to all existing browser windows", () => {
        assert.calledOnce(existingWindow.addEventListener);
        assert.calledWith(existingWindow.addEventListener, "TabClose");
      });
    });

    describe("#uninit", () => {
      beforeEach(async () => {
        nthTabClosedListener.init(triggerHandler);
        nthTabClosedListener.uninit();
      });
      it("should set ._initialized to false and clear the triggerHandler, closed tabs count", () => {
        assert.notOk(nthTabClosedListener._initialized);
        assert.equal(nthTabClosedListener._triggerHandler, null);
        assert.equal(nthTabClosedListener._closedTabs, 0);
      });

      it("should do nothing if already uninitialised", () => {
        nthTabClosedListener.uninit();
        assert.notOk(nthTabClosedListener._initialized);
      });

      it("should remove event listeners from all existing browser windows", () => {
        assert.calledOnce(existingWindow.removeEventListener);
      });
    });
  });

  describe("activityAfterIdle", () => {
    let addObsStub;
    let removeObsStub;
    describe("#init", () => {
      beforeEach(() => {
        addObsStub = sandbox.stub(global.Services.obs, "addObserver");
        sandbox
          .stub(global.Services.wm, "getEnumerator")
          .returns([{ closed: false, document: { hidden: false } }]);
        idleListener.init(triggerHandler);
      });
      afterEach(() => {
        idleListener.uninit();
      });

      it("should set ._initialized to true and save the triggerHandler", () => {
        assert.ok(idleListener._initialized);
        assert.equal(idleListener._triggerHandler, triggerHandler);
      });

      it("if already initialised, it should only update the trigger handler", () => {
        const newTriggerHandler = () => {};
        idleListener.init(newTriggerHandler);
        assert.ok(idleListener._initialized);
        assert.equal(idleListener._triggerHandler, newTriggerHandler);
      });

      it("should add observers for idle and activity", () => {
        assert.called(addObsStub);
      });

      it("should add event listeners to all existing browser windows", () => {
        assert.called(existingWindow.addEventListener);
      });
    });

    describe("#uninit", () => {
      beforeEach(async () => {
        removeObsStub = sandbox.stub(global.Services.obs, "removeObserver");
        sandbox.stub(global.Services.wm, "getEnumerator").returns([]);
        idleListener.init(triggerHandler);
        idleListener.uninit();
      });
      it("should set ._initialized to false and clear the triggerHandler and timestamps", () => {
        assert.notOk(idleListener._initialized);
        assert.equal(idleListener._triggerHandler, null);
        assert.equal(idleListener._quietSince, null);
      });

      it("should do nothing if already uninitialised", () => {
        idleListener.uninit();
        assert.notOk(idleListener._initialized);
      });

      it("should remove observers for idle and activity", () => {
        assert.called(removeObsStub);
      });

      it("should remove event listeners from all existing browser windows", () => {
        assert.called(existingWindow.removeEventListener);
      });
    });
  });

  describe("formAutofill", () => {
    let addObsStub;
    let removeObsStub;
    describe("#init", () => {
      beforeEach(() => {
        addObsStub = sandbox.stub(global.Services.obs, "addObserver");
        formAutofillListener.init(triggerHandler);
      });
      afterEach(() => {
        formAutofillListener.uninit();
      });

      it("should set ._initialized to true and save the triggerHandler", () => {
        assert.ok(formAutofillListener._initialized);
        assert.equal(formAutofillListener._triggerHandler, triggerHandler);
      });

      it("if already initialised, it should only update the trigger handler", () => {
        const newTriggerHandler = () => {};
        formAutofillListener.init(newTriggerHandler);
        assert.ok(formAutofillListener._initialized);
        assert.equal(formAutofillListener._triggerHandler, newTriggerHandler);
      });

      it(`should add observer for ${formAutofillListener._topic}`, () => {
        assert.called(addObsStub);
      });
    });

    describe("#uninit", () => {
      beforeEach(async () => {
        removeObsStub = sandbox.stub(global.Services.obs, "removeObserver");
        formAutofillListener.init(triggerHandler);
        formAutofillListener.uninit();
      });

      it("should set ._initialized to false and clear the triggerHandler", () => {
        assert.notOk(formAutofillListener._initialized);
        assert.equal(formAutofillListener._triggerHandler, null);
      });

      it("should do nothing if already uninitialised", () => {
        formAutofillListener.uninit();
        assert.notOk(formAutofillListener._initialized);
      });

      it(`should remove observers for ${formAutofillListener._topic}`, () => {
        assert.called(removeObsStub);
      });
    });
  });

  describe("openURL listener", () => {
    it("should exist and initially be uninitialised", () => {
      assert.ok(openURLListener);
      assert.notOk(openURLListener._initialized);
    });

    describe("#init", () => {
      beforeEach(() => {
        globals.set(
          "MatchPatternSet",
          sandbox.stub().callsFake(patterns => ({
            patterns,
            matches: url => patterns.has(url),
          }))
        );
        sandbox.stub(global.AboutReaderParent, "addMessageListener");
        sandbox.stub(global.AboutReaderParent, "removeMessageListener");

        openURLListener.init(triggerHandler, hosts);
      });
      afterEach(() => {
        openURLListener.uninit();
      });

      it("should set ._initialized to true and save the triggerHandler and hosts", () => {
        assert.ok(openURLListener._initialized);
        assert.deepEqual(openURLListener._hosts, new Set(hosts));
        assert.equal(openURLListener._triggerHandler, triggerHandler);
      });

      it("should add tab progress listeners to all existing browser windows", () => {
        assert.calledOnce(existingWindow.gBrowser.addTabsProgressListener);
        assert.calledWithExactly(
          existingWindow.gBrowser.addTabsProgressListener,
          openURLListener
        );
      });

      it("if already initialised, should only update the trigger handler and add the new hosts", () => {
        const newHosts = ["www.example.com"];
        const newTriggerHandler = () => {};
        existingWindow.gBrowser.addTabsProgressListener.reset();

        openURLListener.init(newTriggerHandler, newHosts);
        assert.ok(openURLListener._initialized);
        assert.deepEqual(
          openURLListener._hosts,
          new Set([...hosts, ...newHosts])
        );
        assert.equal(openURLListener._triggerHandler, newTriggerHandler);
        assert.notCalled(existingWindow.gBrowser.addTabsProgressListener);
      });
    });

    describe("#uninit", () => {
      beforeEach(async () => {
        openURLListener.init(triggerHandler, hosts);
        openURLListener.uninit();
      });

      it("should set ._initialized to false and clear the triggerHandler and hosts", () => {
        assert.notOk(openURLListener._initialized);
        assert.equal(openURLListener._hosts, null);
        assert.equal(openURLListener._triggerHandler, null);
      });

      it("should remove tab progress listeners from all existing browser windows", () => {
        assert.calledOnce(existingWindow.gBrowser.removeTabsProgressListener);
        assert.calledWithExactly(
          existingWindow.gBrowser.removeTabsProgressListener,
          openURLListener
        );
      });

      it("should do nothing if already uninitialised", () => {
        existingWindow.gBrowser.removeTabsProgressListener.reset();

        openURLListener.uninit();
        assert.notOk(openURLListener._initialized);
        assert.notCalled(existingWindow.gBrowser.removeTabsProgressListener);
      });
    });

    describe("#onLocationChange", () => {
      beforeEach(() => {
        globals.set(
          "MatchPatternSet",
          sandbox.stub().callsFake(patterns => ({
            patterns,
            matches: url => patterns.has(url),
          }))
        );
      });
      afterEach(() => {
        openURLListener.uninit();
        frequentVisitsListener.uninit();
      });

      it("should call the ._triggerHandler with the right arguments", () => {
        const newTriggerHandler = sinon.stub();
        openURLListener.init(newTriggerHandler, hosts);

        const browser = {};
        const webProgress = { isTopLevel: true };
        const location = "www.mozilla.org";
        openURLListener.onLocationChange(browser, webProgress, undefined, {
          host: location,
          spec: location,
        });
        assert.calledOnce(newTriggerHandler);
        assert.calledWithExactly(newTriggerHandler, browser, {
          id: "openURL",
          param: { host: "www.mozilla.org", url: "www.mozilla.org" },
          context: {
            visitsCount: 1,
            url: "www.mozilla.org",
            host: "www.mozilla.org",
          },
        });
      });
      it("should call triggerHandler for a redirect (openURL + frequentVisits)", () => {
        for (let trigger of [openURLListener, frequentVisitsListener]) {
          const newTriggerHandler = sinon.stub();
          trigger.init(newTriggerHandler, hosts);

          const browser = {};
          const webProgress = { isTopLevel: true };
          const aLocationURI = {
            host: "subdomain.mozilla.org",
            spec: "subdomain.mozilla.org",
          };
          const aRequest = {
            QueryInterface: sandbox.stub().returns({
              originalURI: { spec: "www.mozilla.org", host: "www.mozilla.org" },
            }),
          };
          trigger.onLocationChange(
            browser,
            webProgress,
            aRequest,
            aLocationURI
          );
          assert.calledOnce(aRequest.QueryInterface);
          assert.calledOnce(newTriggerHandler);
        }
      });
      it("should call triggerHandler with the right arguments (redirect)", () => {
        const newTriggerHandler = sinon.stub();
        openURLListener.init(newTriggerHandler, hosts);

        const browser = {};
        const webProgress = { isTopLevel: true };
        const aLocationURI = {
          host: "subdomain.mozilla.org",
          spec: "subdomain.mozilla.org",
        };
        const aRequest = {
          QueryInterface: sandbox.stub().returns({
            originalURI: { spec: "www.mozilla.org", host: "www.mozilla.org" },
          }),
        };
        openURLListener.onLocationChange(
          browser,
          webProgress,
          aRequest,
          aLocationURI
        );
        assert.calledWithExactly(newTriggerHandler, browser, {
          id: "openURL",
          param: { host: "www.mozilla.org", url: "www.mozilla.org" },
          context: {
            visitsCount: 1,
            url: "www.mozilla.org",
            host: "www.mozilla.org",
          },
        });
      });
      it("should call triggerHandler for a redirect (openURL + frequentVisits)", () => {
        for (let trigger of [openURLListener, frequentVisitsListener]) {
          const newTriggerHandler = sinon.stub();
          trigger.init(newTriggerHandler, hosts);

          const browser = {};
          const webProgress = { isTopLevel: true };
          const aLocationURI = {
            host: "subdomain.mozilla.org",
            spec: "subdomain.mozilla.org",
          };
          const aRequest = {
            QueryInterface: sandbox.stub().returns({
              originalURI: { spec: "www.mozilla.org", host: "www.mozilla.org" },
            }),
          };
          trigger.onLocationChange(
            browser,
            webProgress,
            aRequest,
            aLocationURI
          );
          assert.calledOnce(aRequest.QueryInterface);
          assert.calledOnce(newTriggerHandler);
        }
      });
      it("should call triggerHandler with the right arguments (redirect)", () => {
        const newTriggerHandler = sinon.stub();
        openURLListener.init(newTriggerHandler, hosts);

        const browser = {};
        const webProgress = { isTopLevel: true };
        const aLocationURI = {
          host: "subdomain.mozilla.org",
          spec: "subdomain.mozilla.org",
        };
        const aRequest = {
          QueryInterface: sandbox.stub().returns({
            originalURI: { spec: "www.mozilla.org", host: "www.mozilla.org" },
          }),
        };
        openURLListener.onLocationChange(
          browser,
          webProgress,
          aRequest,
          aLocationURI
        );
        assert.calledWithExactly(newTriggerHandler, browser, {
          id: "openURL",
          param: { host: "www.mozilla.org", url: "www.mozilla.org" },
          context: {
            visitsCount: 1,
            url: "www.mozilla.org",
            host: "www.mozilla.org",
          },
        });
      });
      it("should fail for subdomains (not redirect)", () => {
        const newTriggerHandler = sinon.stub();
        openURLListener.init(newTriggerHandler, hosts);

        const browser = {};
        const webProgress = { isTopLevel: true };
        const aLocationURI = {
          host: "subdomain.mozilla.org",
          spec: "subdomain.mozilla.org",
        };
        const aRequest = {
          QueryInterface: sandbox.stub().returns({
            originalURI: {
              spec: "subdomain.mozilla.org",
              host: "subdomain.mozilla.org",
            },
          }),
        };
        openURLListener.onLocationChange(
          browser,
          webProgress,
          aRequest,
          aLocationURI
        );
        assert.calledOnce(aRequest.QueryInterface);
        assert.notCalled(newTriggerHandler);
      });
      it("should not throw when the original request URI has no host", () => {
        const newTriggerHandler = sinon.stub();
        openURLListener.init(newTriggerHandler, hosts);

        const browser = {};
        const webProgress = { isTopLevel: true };
        const aLocationURI = {
          host: "subdomain.mozilla.org",
          spec: "subdomain.mozilla.org",
        };
        const aRequest = {
          QueryInterface: sandbox.stub().returns({
            originalURI: {
              spec: "about:robots",
              get host() {
                throw new Error("NS_ERROR_FAILURE");
              },
            },
          }),
        };

        assert.doesNotThrow(() => {
          openURLListener.onLocationChange(
            browser,
            webProgress,
            aRequest,
            aLocationURI
          );
        });
        assert.notCalled(newTriggerHandler);
      });
      it("should call triggerHandler when regexPatterns match the URL", () => {
        const newTriggerHandler = sinon.stub();
        openURLListener.init(newTriggerHandler, [], [], ["mozilla"]);

        const browser = {};
        const webProgress = { isTopLevel: true };
        const aLocationURI = {
          host: "www.mozilla.org",
          spec: "www.mozilla.org",
        };
        const aRequest = {
          QueryInterface: sandbox.stub().returns({
            originalURI: { spec: "www.mozilla.org", host: "www.mozilla.org" },
          }),
        };
        openURLListener.onLocationChange(
          browser,
          webProgress,
          aRequest,
          aLocationURI
        );

        assert.calledOnce(newTriggerHandler);
        assert.calledWithExactly(newTriggerHandler, browser, {
          id: "openURL",
          param: {
            host: "www.mozilla.org",
            url: "www.mozilla.org",
          },
          context: {
            visitsCount: 1,
            url: "www.mozilla.org",
            host: "www.mozilla.org",
          },
        });
      });
    });
  });
});
