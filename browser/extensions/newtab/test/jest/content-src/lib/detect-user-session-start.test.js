/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { DetectUserSessionStart } from "content-src/lib/detect-user-session-start";

describe("detectUserSessionStart", () => {
  let store;
  class PerfService {
    getMostRecentAbsMarkStartByName() {
      return 1234;
    }
    mark() {}
  }

  beforeEach(() => {
    store = { dispatch: () => {} };
  });
  describe("#sendEventOrAddListener", () => {
    it("should call ._sendEvent immediately if the document is visible", () => {
      const mockDocument = { visibilityState: "visible" };
      const instance = new DetectUserSessionStart(store, {
        document: mockDocument,
      });
      jest.spyOn(instance, "_sendEvent").mockImplementation(() => {});

      instance.sendEventOrAddListener();

      expect(instance._sendEvent).toHaveBeenCalledTimes(1);
    });
    it("should add an event listener on visibility changes the document is not visible", () => {
      const mockDocument = {
        visibilityState: "hidden",
        addEventListener: jest.fn(),
      };
      const instance = new DetectUserSessionStart(store, {
        document: mockDocument,
      });
      jest.spyOn(instance, "_sendEvent").mockImplementation(() => {});

      instance.sendEventOrAddListener();

      expect(instance._sendEvent).not.toHaveBeenCalled();
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        "visibilitychange",
        instance._onVisibilityChange
      );
    });
  });
  describe("#_sendEvent", () => {
    it("should dispatch an action with the SAVE_SESSION_PERF_DATA", () => {
      const dispatch = jest.spyOn(store, "dispatch");
      // jsdom's performance has no mark()/getEntriesByName(), so unlike karma
      // under Firefox the default perfService can never produce a mark here.
      const instance = new DetectUserSessionStart(store, {
        perfService: new PerfService(),
      });

      instance._sendEvent();

      expect(dispatch).toHaveBeenCalledWith(
        ac.AlsoToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: {
            visibility_event_rcvd_ts: expect.any(Number),
            window_inner_width: expect.any(Number),
            window_inner_height: expect.any(Number),
          },
        })
      );
    });

    it("shouldn't send a message if getMostRecentAbsMarkStartByName throws", () => {
      let perfService = new PerfService();
      jest
        .spyOn(perfService, "getMostRecentAbsMarkStartByName")
        .mockImplementation(() => {
          throw new Error("failed");
        });
      const dispatch = jest.spyOn(store, "dispatch");
      const instance = new DetectUserSessionStart(store, { perfService });

      instance._sendEvent();

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('should call perfService.mark("visibility_event_rcvd_ts")', () => {
      let perfService = new PerfService();
      jest.spyOn(perfService, "mark");
      const instance = new DetectUserSessionStart(store, { perfService });

      instance._sendEvent();

      expect(perfService.mark).toHaveBeenCalledWith("visibility_event_rcvd_ts");
    });
  });

  describe("_onVisibilityChange", () => {
    it("should not send an event if visiblity is not visible", () => {
      const instance = new DetectUserSessionStart(store, {
        document: { visibilityState: "hidden" },
      });
      jest.spyOn(instance, "_sendEvent").mockImplementation(() => {});

      instance._onVisibilityChange();

      expect(instance._sendEvent).not.toHaveBeenCalled();
    });
    it("should send an event and remove the event listener if visibility is visible", () => {
      const mockDocument = {
        visibilityState: "visible",
        removeEventListener: jest.fn(),
      };
      const instance = new DetectUserSessionStart(store, {
        document: mockDocument,
      });
      jest.spyOn(instance, "_sendEvent").mockImplementation(() => {});

      instance._onVisibilityChange();

      expect(instance._sendEvent).toHaveBeenCalledTimes(1);
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        "visibilitychange",
        instance._onVisibilityChange
      );
    });
  });
});
