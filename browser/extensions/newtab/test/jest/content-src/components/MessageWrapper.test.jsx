/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";
import { MessageWrapper } from "content-src/components/MessageWrapper/MessageWrapper";

// Mock child component
const MockChild = props => (
  <div data-is-intersecting={props.isIntersecting}></div>
);

function Child() {
  return <div className="child-content" />;
}

const VISIBLE_MESSAGE_STATE = {
  ...INITIAL_STATE,
  Messages: {
    ...INITIAL_STATE.Messages,
    isVisible: true,
    messageData: { id: "TEST_MESSAGE" },
  },
};

describe("MessageWrapper Component", () => {
  let container;
  let dispatch;
  let observerStub;

  beforeEach(() => {
    dispatch = jest.fn();
    observerStub = jest
      .spyOn(window, "IntersectionObserver")
      .mockImplementation(function (cb) {
        this.observe = jest.fn();
        this.unobserve = jest.fn();
        this.disconnect = jest.fn();
        this.callback = cb;
      });

    let state = {
      ...INITIAL_STATE,
      Messages: {
        isVisible: true,
        messageData: { id: "test-message-id" },
      },
    };

    ({ container } = render(
      <WrapWithProvider state={state}>
        <MessageWrapper
          dispatch={dispatch}
          document={{
            visibilityState: "visible",
          }}
        >
          <MockChild />
        </MessageWrapper>
      </WrapWithProvider>
    ));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render", () => {
    expect(container).toBeInTheDocument();
    expect(container.querySelector(".message-wrapper")).toBeInTheDocument();
  });

  it("should not render if `Messages.isVisible` is false and hiddenOverride is false", () => {
    ({ container } = render(
      <WrapWithProvider
        state={{
          ...INITIAL_STATE,
          Messages: {
            isVisible: false,
            messageData: { id: "test-message-id" },
          },
        }}
      >
        <MessageWrapper
          hiddenOverride={false}
          dispatch={dispatch}
          document={{
            visibilityState: "visible",
          }}
        >
          <MockChild />
        </MessageWrapper>
      </WrapWithProvider>
    ));

    expect(container.querySelector(".message-wrapper")).not.toBeInTheDocument();
  });

  it("dispatches MESSAGE_IMPRESSION when intersecting", () => {
    // Manually trigger the intersection observer callback
    const child = container.querySelector("[data-is-intersecting]");
    expect(child.getAttribute("data-is-intersecting")).toBe("false");
    const [observerInstance] = observerStub.mock.instances;
    const observedElement = container.querySelector(".message-wrapper");
    // Simulate an intersection
    act(() => {
      observerInstance.callback([
        { isIntersecting: true, target: observedElement },
      ]);
    });
    // Expect dispatch to have been called twice
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});

describe("<MessageWrapper>", () => {
  it("applies wrapperClassName alongside message-wrapper when provided", () => {
    const { container } = render(
      <WrapWithProvider>
        <MessageWrapper dispatch={jest.fn()} wrapperClassName="extra-class">
          <Child />
        </MessageWrapper>
      </WrapWithProvider>
    );
    const wrapper = container.querySelector(".message-wrapper");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.classList.contains("extra-class")).toBe(true);
  });

  it("keeps injected callback references stable across re-renders when the message is unchanged", () => {
    const received = [];
    // MessageWrapper injects the callbacks via React.cloneElement, so a child
    // component records the props it receives on every render.
    function CaptureChild(props) {
      received.push(props);
      return <div className="child-content" />;
    }
    const dispatch = jest.fn();

    const { rerender } = render(
      <WrapWithProvider state={VISIBLE_MESSAGE_STATE}>
        <MessageWrapper dispatch={dispatch}>
          <CaptureChild />
        </MessageWrapper>
      </WrapWithProvider>
    );
    rerender(
      <WrapWithProvider state={VISIBLE_MESSAGE_STATE}>
        <MessageWrapper dispatch={dispatch}>
          <CaptureChild />
        </MessageWrapper>
      </WrapWithProvider>
    );

    expect(received.length).toBeGreaterThanOrEqual(2);
    const [first] = received;
    const last = received[received.length - 1];
    for (const key of [
      "handleDismiss",
      "handleClick",
      "handleBlock",
      "handleClose",
    ]) {
      expect(last[key]).toBe(first[key]);
    }
  });

  describe("MESSAGE_IMPRESSION on intersection", () => {
    let observerCallbacks;
    let visibilityDescriptor;

    beforeEach(() => {
      observerCallbacks = [];
      // The real IntersectionObserver stub in jest-setup never invokes its
      // callback, so replace it locally to capture and manually fire it.
      jest.spyOn(global, "IntersectionObserver").mockImplementation(cb => {
        observerCallbacks.push(cb);
        return {
          observe: jest.fn(),
          unobserve: jest.fn(),
          disconnect: jest.fn(),
        };
      });

      // MessageWrapper only dispatches an impression when the tab is visible,
      // and jsdom defaults document.visibilityState to "prerender".
      visibilityDescriptor = Object.getOwnPropertyDescriptor(
        document,
        "visibilityState"
      );
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      if (visibilityDescriptor) {
        Object.defineProperty(
          document,
          "visibilityState",
          visibilityDescriptor
        );
      } else {
        delete document.visibilityState;
      }
    });

    function fireIntersection() {
      const callback = observerCallbacks[observerCallbacks.length - 1];
      act(() => {
        callback([{ isIntersecting: true, target: {} }]);
      });
    }

    it("dispatches MESSAGE_IMPRESSION only once across repeated intersections", () => {
      const dispatch = jest.fn();
      render(
        <WrapWithProvider state={VISIBLE_MESSAGE_STATE}>
          <MessageWrapper dispatch={dispatch}>
            <Child />
          </MessageWrapper>
        </WrapWithProvider>
      );

      fireIntersection();
      fireIntersection();

      const impressionCalls = dispatch.mock.calls.filter(
        ([action]) => action.type === at.MESSAGE_IMPRESSION
      );
      expect(impressionCalls).toHaveLength(1);
    });
  });
});
