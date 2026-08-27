/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from "@testing-library/react";
import {
  createReorderFlip,
  useReorderFlip,
} from "content-src/lib/useReorderFlip.jsx";

// jsdom has no layout, so each tile's rect is stubbed and mutated between
// syncs to simulate a reorder. The engine only reads left/top.
function setRect(el, { left = 0, top = 0, width = 100, height = 100 }) {
  el.getBoundingClientRect = () => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {},
  });
}

function makeContainer(ids) {
  const container = document.createElement("div");
  for (const id of ids) {
    const el = document.createElement("div");
    el.setAttribute("data-id", id);
    setRect(el, {});
    container.appendChild(el);
  }
  return container;
}

describe("createReorderFlip", () => {
  let reduceMotion;

  beforeEach(() => {
    reduceMotion = false;
    window.matchMedia = jest.fn(() => ({ matches: reduceMotion }));
  });

  it("is not animating before any slide", () => {
    const flip = createReorderFlip({ childSelector: "[data-id]" });
    expect(flip.isAnimating()).toBe(false);
  });

  it("no-ops without a container", () => {
    const flip = createReorderFlip({ childSelector: "[data-id]" });
    expect(() => flip.sync(null, {})).not.toThrow();
    expect(flip.isAnimating()).toBe(false);
  });

  it("a reset pass establishes the baseline without animating", () => {
    const flip = createReorderFlip({ childSelector: "[data-id]" });
    const container = makeContainer(["a", "b"]);
    flip.sync(container, { reset: true });
    const [a] = container.children;
    expect(a.style.transition).toBe("none");
    expect(flip.isAnimating()).toBe(false);
  });

  it("animates only the tiles that moved since the baseline", () => {
    const flip = createReorderFlip({ childSelector: "[data-id]" });
    const container = makeContainer(["a", "b"]);
    const [a, b] = container.children;

    flip.sync(container, { reset: true });
    setRect(b, { left: 100 });
    flip.sync(container, {});

    expect(b.style.transition).toContain("transform");
    // Released back to the natural position so the transition can play.
    expect(b.style.transform).toBe("");
    expect(a.style.transition).toBe("none");
    expect(flip.isAnimating()).toBe(true);
  });

  it("leaves the skipped tile untransformed even when it moved", () => {
    const flip = createReorderFlip({
      childSelector: "[data-id]",
      skipSelector: "[data-skip]",
    });
    const container = makeContainer(["a", "b"]);
    const [, b] = container.children;
    b.setAttribute("data-skip", "");

    flip.sync(container, { reset: true });
    setRect(b, { left: 100 });
    flip.sync(container, {});

    expect(b.style.transition).toBe("none");
  });

  it("does not animate when disabled", () => {
    const flip = createReorderFlip({ childSelector: "[data-id]" });
    const container = makeContainer(["a", "b"]);
    const [, b] = container.children;

    flip.sync(container, { reset: true });
    setRect(b, { left: 100 });
    flip.sync(container, { enabled: false });

    expect(b.style.transition).toBe("none");
    expect(flip.isAnimating()).toBe(false);
  });

  it("does not animate under prefers-reduced-motion", () => {
    const flip = createReorderFlip({ childSelector: "[data-id]" });
    const container = makeContainer(["a", "b"]);
    const [, b] = container.children;

    flip.sync(container, { reset: true });
    setRect(b, { left: 100 });
    reduceMotion = true;
    flip.sync(container, {});

    expect(b.style.transition).toBe("none");
    expect(flip.isAnimating()).toBe(false);
  });
});

describe("useReorderFlip", () => {
  // Mounts a real grid so the hook's ref attaches to a live container and its
  // layout effect actually calls sync() against the tiles.
  function Grid({ orderKey, resetKey, ids }) {
    const ref = useReorderFlip({
      orderKey,
      resetKey,
      childSelector: "[data-id]",
    });
    return (
      <div ref={ref}>
        {ids.map(id => (
          <div key={id} data-id={id} />
        ))}
      </div>
    );
  }

  beforeEach(() => {
    window.matchMedia = jest.fn(() => ({ matches: false }));
  });

  it("animates a tile when the order changes", () => {
    const ids = ["a", "b"];
    const { container, rerender } = render(
      <Grid orderKey="a,b" resetKey="drag" ids={ids} />
    );
    const [a, b] = container.firstChild.children;

    // Mount established the baseline; move a tile then change the order.
    setRect(b, { left: 100 });
    rerender(<Grid orderKey="b,a" resetKey="drag" ids={ids} />);

    expect(b.style.transition).toContain("transform");
    expect(a.style.transition).toBe("none");
  });

  it("does not animate on a drag start alone (only resetKey changed)", () => {
    const ids = ["a", "b"];
    const { container, rerender } = render(
      <Grid orderKey="a,b" resetKey={null} ids={ids} />
    );
    const [, b] = container.firstChild.children;

    // A drag start bumps resetKey but not orderKey: refresh baseline, no slide.
    setRect(b, { left: 100 });
    rerender(<Grid orderKey="a,b" resetKey="b" ids={ids} />);

    expect(b.style.transition).toBe("none");
  });
});
