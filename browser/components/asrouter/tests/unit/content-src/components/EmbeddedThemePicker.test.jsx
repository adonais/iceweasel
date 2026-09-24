/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { mount } from "enzyme";
import { EmbeddedThemePicker } from "content-src/components/EmbeddedThemePicker";

let shownSpy;

if (!customElements.get("theme-picker")) {
  customElements.define(
    "theme-picker",
    class extends HTMLElement {
      shown() {
        shownSpy?.();
      }
    }
  );
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("EmbeddedThemePicker", () => {
  beforeEach(() => {
    shownSpy = sinon.spy();
  });

  it("calls shown() once the picker is defined when installSource is about:welcome", async () => {
    const wrapper = mount(
      <EmbeddedThemePicker installSource="about:welcome" />
    );
    await flushPromises();

    sinon.assert.calledOnce(shownSpy);

    wrapper.unmount();
  });

  it("does not call shown() for other install sources", async () => {
    const wrapper = mount(<EmbeddedThemePicker installSource="unknown" />);
    await flushPromises();

    sinon.assert.notCalled(shownSpy);

    wrapper.unmount();
  });

  it("does not call shown() when installSource is absent", async () => {
    const wrapper = mount(<EmbeddedThemePicker />);
    await flushPromises();

    sinon.assert.notCalled(shownSpy);

    wrapper.unmount();
  });
});
