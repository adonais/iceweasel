/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

jest.mock(
  "content-src/components/DiscoveryStreamComponents/FeatureHighlight/OMCHighlightRegistry.mjs",
  () => {
    const actual = jest.requireActual(
      "content-src/components/DiscoveryStreamComponents/FeatureHighlight/OMCHighlightRegistry.mjs"
    );
    const TEST_REGISTRY = {
      TestPopover: {
        slot: "widgets-row",
        shell: actual.SHELLS.POPOVER,
        chrome: {
          position: "inset-block-start inset-inline-center",
          arrowPosition: "",
          modalClassName: "test-popover-card",
        },
        body: {
          image: { src: "test.png" },
          title: { l10nId: "test-shared-title" },
          subtitle: { l10nId: "test-shared-subtitle" },
          cta: { l10nId: "test-shared-cta" },
        },
        dismiss: actual.DISMISS_MODES.BLOCK,
      },
    };
    return {
      ...actual,
      OMC_HIGHLIGHT_REGISTRY: TEST_REGISTRY,
      getRegistryEntry: messageType =>
        messageType ? TEST_REGISTRY[messageType] || null : null,
    };
  }
);

import { render, fireEvent } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import { OMCHighlightSlot } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/OMCHighlightSlot";
import { SLOTS } from "content-src/components/DiscoveryStreamComponents/FeatureHighlight/OMCHighlightSlots.mjs";
import { INITIAL_STATE } from "common/Reducers.sys.mjs";
import { actionTypes as at } from "common/Actions.mjs";

function stateWithMessage(content) {
  return {
    ...INITIAL_STATE,
    Messages: {
      ...INITIAL_STATE.Messages,
      messageData: { id: "test-message-id", content },
    },
  };
}

describe("<OMCHighlightSlot>", () => {
  it("renders nothing when messageData has no messageType", () => {
    const state = stateWithMessage({});
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".feature-highlight")).toBeNull();
  });

  it("renders nothing when messageType has no matching registry entry", () => {
    const state = stateWithMessage({ messageType: "NotRegistered" });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".feature-highlight")).toBeNull();
  });

  it("renders nothing when entry targets a different slot", () => {
    const state = stateWithMessage({ messageType: "TestPopover" });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot="some-other-slot" dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".feature-highlight")).toBeNull();
  });

  it("renders the popover when messageType matches and slot is widgets-row", () => {
    const state = stateWithMessage({ messageType: "TestPopover" });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".feature-highlight")).toBeInTheDocument();
    expect(container.querySelector(".test-popover-card")).toBeInTheDocument();
    expect(container.querySelector(".title").getAttribute("data-l10n-id")).toBe(
      "test-shared-title"
    );
    expect(
      container.querySelector(".subtitle").getAttribute("data-l10n-id")
    ).toBe("test-shared-subtitle");
  });

  it("applies content overrides when OMC sends raw cardTitle/cardMessage", () => {
    const state = stateWithMessage({
      messageType: "TestPopover",
      cardTitle: "Override Title",
      cardMessage: "Override Body",
    });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".title").textContent).toBe(
      "Override Title"
    );
    expect(container.querySelector(".subtitle").textContent).toBe(
      "Override Body"
    );
  });

  it("renders the CTA button with the registry entry's cta label", () => {
    const state = stateWithMessage({
      messageType: "TestPopover",
      surveyUrl: "https://example.com/survey",
    });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    const button = container.querySelector(".button-wrapper moz-button");
    expect(button).toBeInTheDocument();
    expect(button.getAttribute("data-l10n-id")).toBe("test-shared-cta");
  });

  it("opens the survey URL in a new tab, then records the click and blocks the message", () => {
    const dispatch = jest.fn();
    const state = stateWithMessage({
      messageType: "TestPopover",
      surveyUrl: "https://example.com/survey",
    });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={dispatch} />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: at.OPEN_LINK,
        data: { url: "https://example.com/survey", where: "tab" },
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: at.MESSAGE_CLICK })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: at.MESSAGE_BLOCK })
    );
  });

  it("does not fire MESSAGE_DISMISS when the CTA is clicked (conversion, not dismissal)", () => {
    const dispatch = jest.fn();
    const state = stateWithMessage({
      messageType: "TestPopover",
      surveyUrl: "https://example.com/survey",
    });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={dispatch} />
      </WrapWithProvider>
    );
    fireEvent.click(container.querySelector(".button-wrapper moz-button"));
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: at.MESSAGE_DISMISS })
    );
  });

  it("fires MESSAGE_DISMISS when the callout is dismissed via the X button", () => {
    const dispatch = jest.fn();
    const state = stateWithMessage({
      messageType: "TestPopover",
      surveyUrl: "https://example.com/survey",
    });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={dispatch} />
      </WrapWithProvider>
    );
    fireEvent.click(
      container.querySelector(
        "moz-button[data-l10n-id='feature-highlight-dismiss-button']"
      )
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: at.MESSAGE_DISMISS })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: at.MESSAGE_BLOCK })
    );
  });

  it("does not render the CTA when the message has no surveyUrl", () => {
    const state = stateWithMessage({ messageType: "TestPopover" });
    const { container } = render(
      <WrapWithProvider state={state}>
        <OMCHighlightSlot slot={SLOTS.WIDGETS_ROW} dispatch={jest.fn()} />
      </WrapWithProvider>
    );
    expect(container.querySelector(".button-wrapper moz-button")).toBeNull();
  });
});
