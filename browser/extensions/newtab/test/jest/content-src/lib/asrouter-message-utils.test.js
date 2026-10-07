/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  ASROUTER_NEWTAB_MESSAGE_POSITIONS,
  shouldShowOMCHighlight,
  shouldShowASRouterNewTabMessage,
} from "content-src/lib/asrouter-message-utils.mjs";

const { ABOVE_TOPSITES, ABOVE_WIDGETS, ABOVE_CONTENT_FEED } =
  ASROUTER_NEWTAB_MESSAGE_POSITIONS;

describe("shouldShowOMCHighlight", () => {
  it("returns false when messagesProp is null", () => {
    expect(shouldShowOMCHighlight(null, "TestComponent")).toBe(false);
  });

  it("returns false when messageData is null", () => {
    expect(
      shouldShowOMCHighlight(
        { messageData: null, isVisible: true },
        "TestComponent"
      )
    ).toBe(false);
  });

  it("returns false when messageData is empty", () => {
    expect(
      shouldShowOMCHighlight(
        { messageData: {}, isVisible: true },
        "TestComponent"
      )
    ).toBe(false);
  });

  it("returns false when isVisible is false", () => {
    expect(
      shouldShowOMCHighlight(
        {
          messageData: { content: { messageType: "TestComponent" } },
          isVisible: false,
        },
        "TestComponent"
      )
    ).toBe(false);
  });

  it("returns false when componentId does not match messageType", () => {
    expect(
      shouldShowOMCHighlight(
        {
          messageData: { content: { messageType: "OtherComponent" } },
          isVisible: true,
        },
        "TestComponent"
      )
    ).toBe(false);
  });

  it("returns true when messageType matches and message is visible", () => {
    expect(
      shouldShowOMCHighlight(
        {
          messageData: { content: { messageType: "TestComponent" } },
          isVisible: true,
        },
        "TestComponent"
      )
    ).toBe(true);
  });
});

describe("shouldShowASRouterNewTabMessage", () => {
  function makeMessages({ position, isVisible = true } = {}) {
    return {
      isVisible,
      messageData: {
        content: {
          messageType: "ASRouterNewTabMessage",
          ...(position !== undefined ? { position } : {}),
        },
      },
    };
  }

  it("returns false when messagesProps is null", () => {
    expect(
      shouldShowASRouterNewTabMessage(
        null,
        "ASRouterNewTabMessage",
        ABOVE_TOPSITES
      )
    ).toBe(false);
  });

  it("returns false when messageData is null", () => {
    expect(
      shouldShowASRouterNewTabMessage(
        { messageData: null, isVisible: true },
        "ASRouterNewTabMessage",
        ABOVE_TOPSITES
      )
    ).toBe(false);
  });

  it("returns false when the message is not visible", () => {
    expect(
      shouldShowASRouterNewTabMessage(
        makeMessages({ isVisible: false }),
        "ASRouterNewTabMessage",
        ABOVE_TOPSITES
      )
    ).toBe(false);
  });

  describe("with no position configured (defaults to ABOVE_TOPSITES)", () => {
    let messages;

    beforeEach(() => {
      messages = makeMessages();
    });

    it("returns true at ABOVE_TOPSITES", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_TOPSITES
        )
      ).toBe(true);
    });

    it("returns false at ABOVE_WIDGETS", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_WIDGETS
        )
      ).toBe(false);
    });

    it("returns false at ABOVE_CONTENT_FEED", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_CONTENT_FEED
        )
      ).toBe(false);
    });
  });

  describe("with position ABOVE_TOPSITES", () => {
    let messages;

    beforeEach(() => {
      messages = makeMessages({ position: ABOVE_TOPSITES });
    });

    it("returns true at ABOVE_TOPSITES", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_TOPSITES
        )
      ).toBe(true);
    });

    it("returns false at ABOVE_WIDGETS", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_WIDGETS
        )
      ).toBe(false);
    });

    it("returns false at ABOVE_CONTENT_FEED", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_CONTENT_FEED
        )
      ).toBe(false);
    });
  });

  describe("with position ABOVE_WIDGETS", () => {
    let messages;

    beforeEach(() => {
      messages = makeMessages({ position: ABOVE_WIDGETS });
    });

    it("returns false at ABOVE_TOPSITES", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_TOPSITES
        )
      ).toBe(false);
    });

    it("returns true at ABOVE_WIDGETS", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_WIDGETS
        )
      ).toBe(true);
    });

    it("returns false at ABOVE_CONTENT_FEED", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_CONTENT_FEED
        )
      ).toBe(false);
    });
  });

  describe("with position ABOVE_CONTENT_FEED", () => {
    let messages;

    beforeEach(() => {
      messages = makeMessages({ position: ABOVE_CONTENT_FEED });
    });

    it("returns false at ABOVE_TOPSITES", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_TOPSITES
        )
      ).toBe(false);
    });

    it("returns false at ABOVE_WIDGETS", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_WIDGETS
        )
      ).toBe(false);
    });

    it("returns true at ABOVE_CONTENT_FEED", () => {
      expect(
        shouldShowASRouterNewTabMessage(
          messages,
          "ASRouterNewTabMessage",
          ABOVE_CONTENT_FEED
        )
      ).toBe(true);
    });
  });
});
