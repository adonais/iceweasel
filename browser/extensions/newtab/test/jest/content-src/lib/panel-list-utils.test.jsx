/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, act } from "@testing-library/react";
import { useRef } from "react";
import {
  subscribePanelListToggle,
  usePanelListIsOpen,
} from "content-src/lib/panel-list-utils";

describe("subscribePanelListToggle", () => {
  it("returns a callable no-op cleanup for a nullish panel-list", () => {
    const cleanup = subscribePanelListToggle(null, { onShown: jest.fn() });
    expect(typeof cleanup).toBe("function");
    expect(cleanup).not.toThrow();
  });

  it("invokes onShown/onHidden on shown/hidden and stops after cleanup", () => {
    const el = document.createElement("panel-list");
    const onShown = jest.fn();
    const onHidden = jest.fn();

    const cleanup = subscribePanelListToggle(el, { onShown, onHidden });
    el.dispatchEvent(new CustomEvent("shown"));
    el.dispatchEvent(new CustomEvent("hidden"));
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onHidden).toHaveBeenCalledTimes(1);

    cleanup();
    el.dispatchEvent(new CustomEvent("shown"));
    el.dispatchEvent(new CustomEvent("hidden"));
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it("tolerates missing handlers", () => {
    const el = document.createElement("panel-list");
    const cleanup = subscribePanelListToggle(el);
    expect(() => {
      el.dispatchEvent(new CustomEvent("shown"));
      el.dispatchEvent(new CustomEvent("hidden"));
    }).not.toThrow();
    cleanup();
  });
});

describe("usePanelListIsOpen", () => {
  // Mounts a real <panel-list> so the hook's ref attaches to a live element and
  // its effect subscribes to the element's shown/hidden events. The rendered
  // text mirrors the returned open state.
  function Harness({ onShown, onHidden }) {
    const ref = useRef(null);
    const isOpen = usePanelListIsOpen(ref, { onShown, onHidden });
    return <panel-list ref={ref}>{String(isOpen)}</panel-list>;
  }

  it("tracks the panel-list open state and fires optional callbacks", () => {
    const onShown = jest.fn();
    const onHidden = jest.fn();
    const { container } = render(
      <Harness onShown={onShown} onHidden={onHidden} />
    );
    const el = container.querySelector("panel-list");
    expect(el.textContent).toBe("false");

    act(() => {
      el.dispatchEvent(new CustomEvent("shown"));
    });
    expect(el.textContent).toBe("true");
    expect(onShown).toHaveBeenCalledTimes(1);

    act(() => {
      el.dispatchEvent(new CustomEvent("hidden"));
    });
    expect(el.textContent).toBe("false");
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it("works without handlers", () => {
    const { container } = render(<Harness />);
    const el = container.querySelector("panel-list");
    act(() => {
      el.dispatchEvent(new CustomEvent("shown"));
    });
    expect(el.textContent).toBe("true");
  });
});
