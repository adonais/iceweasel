/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";
import { mount } from "enzyme";
import { TileButton } from "content-src/components/TileButton";
import { MultiStageUtils } from "content-src/lib/multistage-utils.mjs";
import { GlobalOverrider } from "tests/unit/utils";

const INPUT_NAME = "select-item-example";
const BUTTON_ID = `tile-button-${INPUT_NAME}`;
const CONTENT = {
  label: { raw: "Get started" },
  action: { type: "OPEN_URL", data: { args: "https://example.com" } },
  style: "primary",
};

describe("TileButton component", () => {
  let sandbox;
  let globals;
  let handleAction;
  let AWSendEventTelemetry;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    globals = new GlobalOverrider();
    AWSendEventTelemetry = sandbox.stub();
    globals.set({ AWSendEventTelemetry });
    handleAction = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
    globals.restore();
  });

  const makeWrapper = (content = CONTENT) =>
    mount(
      <TileButton
        content={content}
        handleAction={handleAction}
        inputName={INPUT_NAME}
      />
    );

  const click = wrapper =>
    wrapper.find("button").simulate("click", { target: { id: BUTTON_ID } });

  it("should hand the tile's action and source to handleAction on click", () => {
    const wrapper = makeWrapper();
    click(wrapper);

    assert.calledOnce(handleAction);
    const [event] = handleAction.firstCall.args;
    assert.deepEqual(event.action, CONTENT.action);
    assert.equal(event.source, BUTTON_ID);
    assert.equal(event.currentTarget.value, "tile_button");
  });

  it("should not set a name in the event it dispatches", () => {
    const wrapper = makeWrapper();
    click(wrapper);
    assert.isUndefined(handleAction.firstCall.args[0].name);
  });

  it("should send a CLICK_BUTTON event when button is clicked", () => {
    const wrapper = makeWrapper();
    click(wrapper);

    const [event] = handleAction.firstCall.args;
    MultiStageUtils.sendActionTelemetry("TEST_MSG", event.source, event.name);

    assert.calledOnce(AWSendEventTelemetry);
    const [ping] = AWSendEventTelemetry.firstCall.args;
    assert.equal(ping.event, "CLICK_BUTTON");
  });
});
