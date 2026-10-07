/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { _PerfService } from "content-src/lib/perf-service";

/**
 * Minimal stand-in for Window.performance with known state, ported from the
 * karma helper in test/unit/utils.js. The "startTime" for each mark is simply
 * the number of times mark has been called on this object.
 */
function FakePerformance() {}
FakePerformance.prototype = {
  marks: new Map(),
  now() {
    return window.performance.now();
  },
  timing: { navigationStart: 222222.123 },
  get timeOrigin() {
    return 10000.234;
  },
  // XXX assumes type == "mark"
  getEntriesByName(name, _type) {
    if (this.marks.has(name)) {
      return this.marks.get(name);
    }
    return [];
  },
  callsToMark: 0,

  mark(name) {
    let markObj = {
      name,
      entryType: "mark",
      startTime: ++this.callsToMark,
      duration: 0,
    };

    if (this.marks.has(name)) {
      this.marks.get(name).push(markObj);
      return;
    }

    this.marks.set(name, [markObj]);
  },
};

let perfService;

describe("_PerfService", () => {
  let fakePerfObj;

  beforeEach(() => {
    fakePerfObj = new FakePerformance();
    perfService = new _PerfService({ performanceObj: fakePerfObj });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("#absNow", () => {
    it("should return a number > the time origin", () => {
      const absNow = perfService.absNow();

      expect(absNow).toBeGreaterThan(perfService.timeOrigin);
    });
  });
  describe("#getEntriesByName", () => {
    it("should call getEntriesByName on the appropriate Window.performance", () => {
      jest.spyOn(fakePerfObj, "getEntriesByName");

      perfService.getEntriesByName("monkey", "mark");

      expect(fakePerfObj.getEntriesByName).toHaveBeenCalledTimes(1);
      expect(fakePerfObj.getEntriesByName).toHaveBeenCalledWith(
        "monkey",
        "mark"
      );
    });

    it("should return entries with the given name", () => {
      jest.spyOn(fakePerfObj, "getEntriesByName");
      perfService.mark("monkey");
      perfService.mark("dog");

      let marks = perfService.getEntriesByName("monkey", "mark");

      expect(Array.isArray(marks)).toBe(true);
      expect(marks).toHaveLength(1);
      expect(marks[0]).toHaveProperty("name", "monkey");
    });
  });

  describe("#getMostRecentAbsMarkStartByName", () => {
    it("should throw an error if there is no mark with the given name", () => {
      function bogusGet() {
        perfService.getMostRecentAbsMarkStartByName("rheeeet");
      }

      expect(bogusGet).toThrow(Error);
      expect(bogusGet).toThrow(/No marks with the name/);
    });

    it("should return the Number from the most recent mark with the given name + the time origin", () => {
      perfService.mark("dog");
      perfService.mark("dog");

      let absMarkStart = perfService.getMostRecentAbsMarkStartByName("dog");

      // 2 because we want the result of the 2nd call to mark, and an instance
      // of FakePerformance just returns the number of time mark has been
      // called.
      expect(absMarkStart - perfService.timeOrigin).toBe(2);
    });
  });

  describe("#mark", () => {
    it("should call the wrapped version of mark", () => {
      jest.spyOn(fakePerfObj, "mark");

      perfService.mark("monkey");

      expect(fakePerfObj.mark).toHaveBeenCalledTimes(1);
      expect(fakePerfObj.mark).toHaveBeenCalledWith("monkey");
    });
  });

  describe("#timeOrigin", () => {
    it("should get the origin of the wrapped performance object", () => {
      expect(perfService.timeOrigin).toBe(fakePerfObj.timeOrigin);
    });
  });
});
