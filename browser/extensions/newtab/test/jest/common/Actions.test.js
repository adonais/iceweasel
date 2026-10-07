/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  actionCreators as ac,
  actionTypes as at,
  actionUtils as au,
  BACKGROUND_PROCESS,
  CONTENT_MESSAGE_TYPE,
  globalImportContext,
  MAIN_MESSAGE_TYPE,
  PRELOAD_MESSAGE_TYPE,
  UI_CODE,
} from "common/Actions.mjs";

describe("Actions", () => {
  it("should set globalImportContext to UI_CODE", () => {
    expect(globalImportContext).toBe(UI_CODE);
  });
});

describe("ActionTypes", () => {
  it("should be in alpha order", () => {
    expect(Object.keys(at).join(", ")).toBe(Object.keys(at).sort().join(", "));
  });
});

describe("ActionCreators", () => {
  describe("_RouteMessage", () => {
    it("should throw if options are not passed as the second param", () => {
      expect(() => {
        au._RouteMessage({ type: "FOO" });
      }).toThrow();
    });
    it("should set all defined options on the .meta property of the new action", () => {
      expect(
        au._RouteMessage(
          { type: "FOO", meta: { hello: "world" } },
          { from: "foo", to: "bar" }
        )
      ).toEqual({
        type: "FOO",
        meta: { hello: "world", from: "foo", to: "bar" },
      });
    });
    it("should remove any undefined options related to message routing", () => {
      const action = au._RouteMessage(
        { type: "FOO", meta: { fromTarget: "bar" } },
        { from: "foo", to: "bar" }
      );
      expect(action.meta.fromTarget).toBeUndefined();
    });
  });
  describe("AlsoToMain", () => {
    it("should create the right action", () => {
      const action = { type: "FOO", data: "BAR" };
      const newAction = ac.AlsoToMain(action);
      expect(newAction).toEqual({
        type: "FOO",
        data: "BAR",
        meta: { from: CONTENT_MESSAGE_TYPE, to: MAIN_MESSAGE_TYPE },
      });
    });
    it("should add the fromTarget if it was supplied", () => {
      const action = { type: "FOO", data: "BAR" };
      const newAction = ac.AlsoToMain(action, "port123");
      expect(newAction.meta.fromTarget).toBe("port123");
    });
    describe("isSendToMain", () => {
      it("should return true if action is AlsoToMain", () => {
        const newAction = ac.AlsoToMain({ type: "FOO" });
        expect(au.isSendToMain(newAction)).toBe(true);
      });
      it("should return false if action is not AlsoToMain", () => {
        expect(au.isSendToMain({ type: "FOO" })).toBe(false);
      });
    });
  });
  describe("AlsoToOneContent", () => {
    it("should create the right action", () => {
      const action = { type: "FOO", data: "BAR" };
      const targetId = "abc123";
      const newAction = ac.AlsoToOneContent(action, targetId);
      expect(newAction).toEqual({
        type: "FOO",
        data: "BAR",
        meta: {
          from: MAIN_MESSAGE_TYPE,
          to: CONTENT_MESSAGE_TYPE,
          toTarget: targetId,
        },
      });
    });
    it("should throw if no targetId is provided", () => {
      expect(() => {
        ac.AlsoToOneContent({ type: "FOO" });
      }).toThrow();
    });
    describe("isSendToOneContent", () => {
      it("should return true if action is AlsoToOneContent", () => {
        const newAction = ac.AlsoToOneContent({ type: "FOO" }, "foo123");
        expect(au.isSendToOneContent(newAction)).toBe(true);
      });
      it("should return false if action is not AlsoToMain", () => {
        expect(au.isSendToOneContent({ type: "FOO" })).toBe(false);
        expect(
          au.isSendToOneContent(ac.BroadcastToContent({ type: "FOO" }))
        ).toBe(false);
      });
    });
    describe("isFromMain", () => {
      it("should return true if action is AlsoToOneContent", () => {
        const newAction = ac.AlsoToOneContent({ type: "FOO" }, "foo123");
        expect(au.isFromMain(newAction)).toBe(true);
      });
      it("should return true if action is BroadcastToContent", () => {
        const newAction = ac.BroadcastToContent({ type: "FOO" });
        expect(au.isFromMain(newAction)).toBe(true);
      });
      it("should return false if action is AlsoToMain", () => {
        const newAction = ac.AlsoToMain({ type: "FOO" });
        expect(au.isFromMain(newAction)).toBe(false);
      });
    });
  });
  describe("BroadcastToContent", () => {
    it("should create the right action", () => {
      const action = { type: "FOO", data: "BAR" };
      const newAction = ac.BroadcastToContent(action);
      expect(newAction).toEqual({
        type: "FOO",
        data: "BAR",
        meta: { from: MAIN_MESSAGE_TYPE, to: CONTENT_MESSAGE_TYPE },
      });
    });
    describe("isBroadcastToContent", () => {
      it("should return true if action is BroadcastToContent", () => {
        expect(
          au.isBroadcastToContent(ac.BroadcastToContent({ type: "FOO" }))
        ).toBe(true);
      });
      it("should return false if action is not BroadcastToContent", () => {
        expect(au.isBroadcastToContent({ type: "FOO" })).toBe(false);
        expect(
          au.isBroadcastToContent(
            ac.AlsoToOneContent({ type: "FOO" }, "foo123")
          )
        ).toBe(false);
      });
    });
  });
  describe("AlsoToPreloaded", () => {
    it("should create the right action", () => {
      const action = { type: "FOO", data: "BAR" };
      const newAction = ac.AlsoToPreloaded(action);
      expect(newAction).toEqual({
        type: "FOO",
        data: "BAR",
        meta: { from: MAIN_MESSAGE_TYPE, to: PRELOAD_MESSAGE_TYPE },
      });
    });
  });
  describe("isSendToPreloaded", () => {
    it("should return true if action is AlsoToPreloaded", () => {
      expect(au.isSendToPreloaded(ac.AlsoToPreloaded({ type: "FOO" }))).toBe(
        true
      );
    });
    it("should return false if action is not AlsoToPreloaded", () => {
      expect(au.isSendToPreloaded({ type: "FOO" })).toBe(false);
      expect(au.isSendToPreloaded(ac.BroadcastToContent({ type: "FOO" }))).toBe(
        false
      );
    });
  });
  describe("UserEvent", () => {
    it("should include the given data", () => {
      const data = { action: "foo" };
      expect(ac.UserEvent(data).data).toBe(data);
    });
    it("should wrap with AlsoToMain", () => {
      const action = ac.UserEvent({ action: "foo" });
      expect(au.isSendToMain(action)).toBe(true);
    });
  });
  describe("ImpressionStats", () => {
    it("should include the right data", () => {
      const data = { action: "foo" };
      expect(ac.ImpressionStats(data).data).toBe(data);
    });
    it("should wrap with AlsoToMain if in UI code", () => {
      expect(au.isSendToMain(ac.ImpressionStats({ action: "foo" }))).toBe(true);
    });
    it("should not wrap with AlsoToMain if not in UI code", () => {
      const action = ac.ImpressionStats({ action: "foo" }, BACKGROUND_PROCESS);
      expect(au.isSendToMain(action)).toBe(false);
    });
  });
  describe("WebExtEvent", () => {
    it("should set the provided type", () => {
      const action = ac.WebExtEvent(at.WEBEXT_CLICK, {
        source: "MyExtension",
        url: "foo.com",
      });
      expect(action.type).toBe(at.WEBEXT_CLICK);
    });
    it("should set the provided data", () => {
      const data = { source: "MyExtension", url: "foo.com" };
      const action = ac.WebExtEvent(at.WEBEXT_CLICK, data);
      expect(action.data).toBe(data);
    });
    it("should throw if the 'source' property is missing", () => {
      expect(() => {
        ac.WebExtEvent(at.WEBEXT_CLICK, {});
      }).toThrow();
    });
  });
  describe("SetMultiplePrefs", () => {
    it("should set the type and a values map", () => {
      const values = {
        "widgets.maximized": true,
        "widgets.lists.size": "large",
      };
      const action = ac.SetMultiplePrefs(values);
      expect(action.type).toBe(at.SET_MULTIPLE_PREFS);
      expect(action.data.values).toBe(values);
    });
    it("should wrap with AlsoToMain if in UI code", () => {
      expect(au.isSendToMain(ac.SetMultiplePrefs({ foo: 1 }))).toBe(true);
    });
    it("should not wrap with AlsoToMain if not in UI code", () => {
      const action = ac.SetMultiplePrefs({ foo: 1 }, BACKGROUND_PROCESS);
      expect(au.isSendToMain(action)).toBe(false);
    });
  });
});

describe("ActionUtils", () => {
  describe("getPortIdOfSender", () => {
    it("should return the PortID from a AlsoToMain action", () => {
      const portID = "foo123";
      const result = au.getPortIdOfSender(
        ac.AlsoToMain({ type: "FOO" }, portID)
      );
      expect(result).toBe(portID);
    });
  });
});
