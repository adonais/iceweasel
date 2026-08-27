/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { ComponentPerfTimer } from "content-src/components/ComponentPerfTimer/ComponentPerfTimer";
import createMockRaf from "mock-raf";
import React from "react";

const perfSvc = {
  mark() {},
  getMostRecentAbsMarkStartByName() {},
};

const DEFAULT_PROPS = {
  initialized: true,
  rows: [],
  id: "highlights",
  dispatch() {},
  perfSvc,
};

describe("<ComponentPerfTimer>", () => {
  let mockRaf;
  let wrapper;
  let ref;

  const InnerEl = () => <div>Inner Element</div>;

  // RTL has no shallow()/instance() equivalent, so render the real component
  // and reach its class instance through a ref (ref.current). This is the
  // faithful stand-in for the legacy wrapper.instance() calls.
  const renderTimer = () => {
    ref = React.createRef();
    return render(
      <ComponentPerfTimer {...DEFAULT_PROPS} ref={ref}>
        <InnerEl />
      </ComponentPerfTimer>
    );
  };

  beforeEach(() => {
    mockRaf = createMockRaf();
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(mockRaf.raf);
    wrapper = renderTimer();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render props.children", () => {
    expect(wrapper.getByText("Inner Element")).toBeInTheDocument();
  });

  describe("#constructor", () => {
    beforeEach(() => {
      jest
        .spyOn(ComponentPerfTimer.prototype, "_maybeSendBadStateEvent")
        .mockImplementation(() => {});
      jest
        .spyOn(ComponentPerfTimer.prototype, "_ensureFirstRenderTsRecorded")
        .mockImplementation(() => {});
      // enzyme's { disableLifecycleMethods: true } has no RTL equivalent;
      // stub componentDidMount so the mount lifecycle can't mutate the
      // instance flags this block inspects.
      jest
        .spyOn(ComponentPerfTimer.prototype, "componentDidMount")
        .mockImplementation(() => {});
      wrapper = renderTimer();
    });

    it("should have the correct defaults", () => {
      const instance = ref.current;

      expect(instance._reportMissingData).toBe(false);
      expect(instance._timestampHandled).toBe(false);
      expect(instance._recordedFirstRender).toBe(false);
    });
  });

  describe("#render", () => {
    beforeEach(() => {
      jest.replaceProperty(DEFAULT_PROPS, "id", "fake_section");
      jest
        .spyOn(ComponentPerfTimer.prototype, "_maybeSendBadStateEvent")
        .mockImplementation(() => {});
      jest
        .spyOn(ComponentPerfTimer.prototype, "_ensureFirstRenderTsRecorded")
        .mockImplementation(() => {});
      wrapper = renderTimer();
    });

    it("should not call telemetry on sections that we don't want to record", () => {
      const instance = ref.current;

      expect(instance._maybeSendBadStateEvent).not.toHaveBeenCalled();
      expect(instance._ensureFirstRenderTsRecorded).not.toHaveBeenCalled();
    });
  });

  describe("#_componentDidMount", () => {
    it("should call _maybeSendPaintedEvent", () => {
      const instance = ref.current;
      const stub = jest
        .spyOn(instance, "_maybeSendPaintedEvent")
        .mockImplementation(() => {});

      instance.componentDidMount();

      expect(stub).toHaveBeenCalledTimes(1);
    });

    it("should not call _maybeSendPaintedEvent if id not in RECORDED_SECTIONS", () => {
      jest.replaceProperty(DEFAULT_PROPS, "id", "topstories");
      wrapper = renderTimer();
      const instance = ref.current;
      const stub = jest
        .spyOn(instance, "_maybeSendPaintedEvent")
        .mockImplementation(() => {});

      instance.componentDidMount();

      expect(stub).not.toHaveBeenCalled();
    });
  });

  describe("#_componentDidUpdate", () => {
    it("should call _maybeSendPaintedEvent", () => {
      const instance = ref.current;
      const maybeSendPaintStub = jest
        .spyOn(instance, "_maybeSendPaintedEvent")
        .mockImplementation(() => {});

      instance.componentDidUpdate();

      expect(maybeSendPaintStub).toHaveBeenCalledTimes(1);
    });

    it("should not call _maybeSendPaintedEvent if id not in RECORDED_SECTIONS", () => {
      jest.replaceProperty(DEFAULT_PROPS, "id", "topstories");
      wrapper = renderTimer();
      const instance = ref.current;
      const stub = jest
        .spyOn(instance, "_maybeSendPaintedEvent")
        .mockImplementation(() => {});

      instance.componentDidUpdate();

      expect(stub).not.toHaveBeenCalled();
    });
  });

  describe("_ensureFirstRenderTsRecorded", () => {
    let recordFirstRenderStub;
    beforeEach(() => {
      jest
        .spyOn(ComponentPerfTimer.prototype, "_maybeSendBadStateEvent")
        .mockImplementation(() => {});
      recordFirstRenderStub = jest
        .spyOn(ComponentPerfTimer.prototype, "_ensureFirstRenderTsRecorded")
        .mockImplementation(() => {});
    });

    it("should set _recordedFirstRender", () => {
      jest.replaceProperty(DEFAULT_PROPS, "initialized", false);
      wrapper = renderTimer();
      const instance = ref.current;

      expect(instance._recordedFirstRender).toBe(false);

      recordFirstRenderStub.mockRestore();
      instance._ensureFirstRenderTsRecorded();

      expect(instance._recordedFirstRender).toBe(true);
    });

    it("should mark first_render_ts", () => {
      jest.replaceProperty(DEFAULT_PROPS, "initialized", false);
      wrapper = renderTimer();
      const instance = ref.current;
      const stub = jest.spyOn(perfSvc, "mark");

      recordFirstRenderStub.mockRestore();
      instance._ensureFirstRenderTsRecorded();

      expect(stub).toHaveBeenCalledTimes(1);
      expect(stub).toHaveBeenCalledWith(`${DEFAULT_PROPS.id}_first_render_ts`);
    });
  });

  describe("#_maybeSendBadStateEvent", () => {
    let sendBadStateStub;
    beforeEach(() => {
      sendBadStateStub = jest
        .spyOn(ComponentPerfTimer.prototype, "_maybeSendBadStateEvent")
        .mockImplementation(() => {});
      jest
        .spyOn(ComponentPerfTimer.prototype, "_ensureFirstRenderTsRecorded")
        .mockImplementation(() => {});
    });

    it("should set this._reportMissingData=true when called with initialized === false", () => {
      jest.replaceProperty(DEFAULT_PROPS, "initialized", false);
      wrapper = renderTimer();
      const instance = ref.current;

      expect(instance._reportMissingData).toBe(false);

      sendBadStateStub.mockRestore();
      instance._maybeSendBadStateEvent();

      expect(instance._reportMissingData).toBe(true);
    });

    it("should call _sendBadStateEvent if initialized & other metrics have been recorded", () => {
      const instance = ref.current;
      const stub = jest
        .spyOn(instance, "_sendBadStateEvent")
        .mockImplementation(() => {});
      instance._reportMissingData = true;
      instance._timestampHandled = true;
      instance._recordedFirstRender = true;

      sendBadStateStub.mockRestore();
      instance._maybeSendBadStateEvent();

      expect(stub).toHaveBeenCalledTimes(1);
      expect(instance._reportMissingData).toBe(false);
    });
  });

  describe("#_maybeSendPaintedEvent", () => {
    it("should call _sendPaintedEvent if props.initialized is true", () => {
      jest.replaceProperty(DEFAULT_PROPS, "initialized", true);
      // Stand-in for enzyme's { disableLifecycleMethods: true }: keep the mount
      // lifecycle from flipping _timestampHandled before we inspect it.
      jest
        .spyOn(ComponentPerfTimer.prototype, "componentDidMount")
        .mockImplementation(() => {});
      wrapper = renderTimer();
      const instance = ref.current;
      const stub = jest
        .spyOn(instance, "_afterFramePaint")
        .mockImplementation(() => {});

      expect(instance._timestampHandled).toBe(false);

      instance._maybeSendPaintedEvent();

      expect(stub).toHaveBeenCalledTimes(1);
      expect(stub).toHaveBeenCalledWith(instance._sendPaintedEvent);
      expect(ref.current._timestampHandled).toBe(true);
    });
    it("should not call _sendPaintedEvent if this._timestampHandled is true", () => {
      const instance = ref.current;
      const spy = jest.spyOn(instance, "_afterFramePaint");
      instance._timestampHandled = true;

      instance._maybeSendPaintedEvent();
      expect(spy).not.toHaveBeenCalledWith(instance._sendPaintedEvent);
    });
    it("should not call _sendPaintedEvent if component not initialized", () => {
      jest.replaceProperty(DEFAULT_PROPS, "initialized", false);
      wrapper = renderTimer();
      const instance = ref.current;
      const spy = jest.spyOn(instance, "_afterFramePaint");

      instance._maybeSendPaintedEvent();

      expect(spy).not.toHaveBeenCalledWith(instance._sendPaintedEvent);
    });
  });

  describe("#_afterFramePaint", () => {
    it("should call callback after the requestAnimationFrame callback returns", () =>
      new Promise(resolve => {
        // Setting the callback to resolve is the test that it does finally get
        // called at the correct time, after the event loop ticks again.
        // If it doesn't get called, this test will time out.
        const callback = jest.fn(resolve);

        const instance = ref.current;

        instance._afterFramePaint(callback);

        expect(callback).not.toHaveBeenCalled();
        mockRaf.step({ count: 1 });
      }));
  });

  describe("#_sendBadStateEvent", () => {
    it("should call perfSvc.mark", () => {
      jest.spyOn(perfSvc, "mark");
      const key = `${DEFAULT_PROPS.id}_data_ready_ts`;

      ref.current._sendBadStateEvent();

      expect(perfSvc.mark).toHaveBeenCalledTimes(1);
      expect(perfSvc.mark).toHaveBeenCalledWith(key);
    });

    it("should call compute the delta from first render to data ready", () => {
      jest.spyOn(perfSvc, "getMostRecentAbsMarkStartByName");

      ref.current._sendBadStateEvent(`${DEFAULT_PROPS.id}_data_ready_ts`);

      expect(perfSvc.getMostRecentAbsMarkStartByName).toHaveBeenCalledTimes(2);
      expect(perfSvc.getMostRecentAbsMarkStartByName).toHaveBeenCalledWith(
        `${DEFAULT_PROPS.id}_data_ready_ts`
      );
      expect(perfSvc.getMostRecentAbsMarkStartByName).toHaveBeenCalledWith(
        `${DEFAULT_PROPS.id}_first_render_ts`
      );
    });

    it("should call dispatch SAVE_SESSION_PERF_DATA", () => {
      jest
        .spyOn(perfSvc, "getMostRecentAbsMarkStartByName")
        .mockImplementation(markName => {
          if (markName === "highlights_first_render_ts") {
            return 0.5;
          }
          if (markName === "highlights_data_ready_ts") {
            return 3.2;
          }
          return undefined;
        });

      const dispatch = jest.spyOn(DEFAULT_PROPS, "dispatch");
      wrapper = renderTimer();

      ref.current._sendBadStateEvent();

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: { [`${DEFAULT_PROPS.id}_data_late_by_ms`]: 2 },
        })
      );
    });
  });

  describe("#_sendPaintedEvent", () => {
    beforeEach(() => {
      jest
        .spyOn(ComponentPerfTimer.prototype, "_maybeSendBadStateEvent")
        .mockImplementation(() => {});
      jest
        .spyOn(ComponentPerfTimer.prototype, "_ensureFirstRenderTsRecorded")
        .mockImplementation(() => {});
    });

    it("should not call mark with the wrong id", () => {
      jest.spyOn(perfSvc, "mark");
      jest.replaceProperty(DEFAULT_PROPS, "id", "fake_id");
      wrapper = renderTimer();

      ref.current._sendPaintedEvent();

      expect(perfSvc.mark).not.toHaveBeenCalled();
    });
    it("should call mark with the correct topsites", () => {
      jest.spyOn(perfSvc, "mark");
      jest.replaceProperty(DEFAULT_PROPS, "id", "topsites");
      wrapper = renderTimer();

      ref.current._sendPaintedEvent();

      expect(perfSvc.mark).toHaveBeenCalledTimes(1);
      expect(perfSvc.mark).toHaveBeenCalledWith("topsites_first_painted_ts");
    });
    it("should not call getMostRecentAbsMarkStartByName if id!=topsites", () => {
      jest.spyOn(perfSvc, "getMostRecentAbsMarkStartByName");
      jest.replaceProperty(DEFAULT_PROPS, "id", "fake_id");
      wrapper = renderTimer();

      ref.current._sendPaintedEvent();

      expect(perfSvc.getMostRecentAbsMarkStartByName).not.toHaveBeenCalled();
    });
    it("should call getMostRecentAbsMarkStartByName for topsites", () => {
      jest.spyOn(perfSvc, "getMostRecentAbsMarkStartByName");
      jest.replaceProperty(DEFAULT_PROPS, "id", "topsites");
      wrapper = renderTimer();

      ref.current._sendPaintedEvent();

      expect(perfSvc.getMostRecentAbsMarkStartByName).toHaveBeenCalledTimes(1);
      expect(perfSvc.getMostRecentAbsMarkStartByName).toHaveBeenCalledWith(
        "topsites_first_painted_ts"
      );
    });
    it("should dispatch SAVE_SESSION_PERF_DATA", () => {
      jest
        .spyOn(perfSvc, "getMostRecentAbsMarkStartByName")
        .mockReturnValue(42);
      jest.replaceProperty(DEFAULT_PROPS, "id", "topsites");
      const dispatch = jest.spyOn(DEFAULT_PROPS, "dispatch");
      wrapper = renderTimer();

      ref.current._sendPaintedEvent();

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith(
        ac.OnlyToMain({
          type: at.SAVE_SESSION_PERF_DATA,
          data: { topsites_first_painted_ts: 42 },
        })
      );
    });
  });
});
