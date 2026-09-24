/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  PANEL_HIDDEN,
  isRootPanelVisible,
  isThemesPanelVisible,
  notifyThemePickerShown,
  notifyThemePickersOnTransition,
} from "content-src/lib/theme-picker-shown";
import { CUSTOMIZE_SUBPANELS } from "content-src/lib/constants";

const ROOT_VISIBLE = {
  showing: true,
  activeSubpanel: null,
};
const HIDDEN = { ...ROOT_VISIBLE, showing: false };
const THEMES_VISIBLE = {
  ...ROOT_VISIBLE,
  activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
};

const shownCalls = [];
// Shaped like the lit element: once defined, `layout` is a property, so React
// sets it as a property rather than an attribute.
class StubThemePicker extends HTMLElement {
  get layout() {
    return this._layout ?? this.getAttribute("layout");
  }
  set layout(value) {
    this._layout = value;
  }
  shown() {
    shownCalls.push(this);
  }
}

// Lets any pending promise callbacks run, including a shown() call.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// A picker rendered before the element was defined: React set the attribute.
function makeAttributePicker(layout) {
  const el = document.createElement("theme-picker");
  el.setAttribute("layout", layout);
  return el;
}

// A picker rendered after the element was defined: React set the property.
function makeUpgradedPicker(layout) {
  const el = document.createElement("theme-picker");
  el.layout = layout;
  return el;
}

describe("theme-picker-shown", () => {
  beforeEach(() => {
    shownCalls.length = 0;
    document.body.innerHTML = "";
  });

  describe("isRootPanelVisible", () => {
    it("is false when the panel is not showing", () => {
      expect(isRootPanelVisible(HIDDEN)).toBe(false);
    });

    it("is true when showing with no subpanel open", () => {
      expect(isRootPanelVisible(ROOT_VISIBLE)).toBe(true);
    });

    it("is false when showing with a subpanel open", () => {
      expect(
        isRootPanelVisible({
          ...ROOT_VISIBLE,
          activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
        })
      ).toBe(false);
    });

    it("reads PANEL_HIDDEN as hidden", () => {
      expect(isRootPanelVisible(PANEL_HIDDEN)).toBe(false);
      expect(isThemesPanelVisible(PANEL_HIDDEN)).toBe(false);
    });
  });

  describe("isThemesPanelVisible", () => {
    it("is false when the panel is not showing", () => {
      expect(
        isThemesPanelVisible({
          ...HIDDEN,
          activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
        })
      ).toBe(false);
    });

    it("is false when showing without the themes subpanel", () => {
      expect(isThemesPanelVisible(ROOT_VISIBLE)).toBe(false);
    });

    it("is true when showing with the themes subpanel open", () => {
      expect(isThemesPanelVisible(THEMES_VISIBLE)).toBe(true);
    });
  });

  describe("notifyThemePickerShown", () => {
    it("does nothing for a missing element", async () => {
      await expect(notifyThemePickerShown(null)).resolves.toBeUndefined();
    });

    // Custom elements stay registered, so this test must run before any that
    // relies on theme-picker being defined.
    it("waits for the definition, keeps only the latest request per element, and re-checks visibility afterwards", async () => {
      const compact = makeAttributePicker("compact");
      const full = makeAttributePicker("full");
      document.body.append(compact, full);
      const superseded = notifyThemePickerShown(compact);
      const latest = notifyThemePickerShown(compact);
      let fullVisible = true;
      const hiddenByThen = notifyThemePickerShown(full, () => fullVisible);
      await flush();
      expect(shownCalls).toHaveLength(0);

      fullVisible = false;
      customElements.define("theme-picker", StubThemePicker);
      await Promise.all([superseded, latest, hiddenByThen]);
      expect(shownCalls).toEqual([compact]);
    });

    it("skips an element that is no longer in the document", async () => {
      const el = makeUpgradedPicker("compact");
      await notifyThemePickerShown(el);
      expect(shownCalls).toHaveLength(0);
    });

    it("skips when the live check says the picker is no longer shown", async () => {
      const el = makeUpgradedPicker("compact");
      document.body.append(el);
      await notifyThemePickerShown(el, () => false);
      expect(shownCalls).toHaveLength(0);
    });

    it("skips an element without shown(), as on older hosts", async () => {
      const el = makeUpgradedPicker("compact");
      document.body.append(el);
      el.shown = undefined;
      await expect(notifyThemePickerShown(el)).resolves.toBeUndefined();
      expect(shownCalls).toHaveLength(0);
    });
  });

  describe("notifyThemePickersOnTransition", () => {
    let container;
    let compact;
    let full;
    beforeEach(() => {
      container = document.createElement("div");
      compact = makeUpgradedPicker("compact");
      full = makeUpgradedPicker("full");
      container.append(compact, full);
      document.body.append(container);
    });

    const transition = (prevProps, props) =>
      notifyThemePickersOnTransition(container, prevProps, () => props);

    it("does nothing without a container", async () => {
      notifyThemePickersOnTransition(null, HIDDEN, () => ROOT_VISIBLE);
      await flush();
      expect(shownCalls).toHaveLength(0);
    });

    it("notifies the compact picker when the panel opens on the root", async () => {
      transition(HIDDEN, ROOT_VISIBLE);
      await flush();
      expect(shownCalls).toEqual([compact]);
    });

    it("finds a picker that still carries layout as an attribute", async () => {
      compact.remove();
      const attributeCompact = makeAttributePicker("compact");
      container.append(attributeCompact);
      transition(HIDDEN, ROOT_VISIBLE);
      await flush();
      expect(shownCalls).toEqual([attributeCompact]);
    });

    it("does not notify the compact picker when the panel opens into a subpanel", async () => {
      transition(HIDDEN, {
        ...ROOT_VISIBLE,
        activeSubpanel: CUSTOMIZE_SUBPANELS.WIDGETS,
      });
      await flush();
      expect(shownCalls).toHaveLength(0);
    });

    it("notifies the compact picker when a subpanel closes back to the root", async () => {
      transition(
        { ...ROOT_VISIBLE, activeSubpanel: CUSTOMIZE_SUBPANELS.WALLPAPERS },
        ROOT_VISIBLE
      );
      await flush();
      expect(shownCalls).toEqual([compact]);
    });

    it("notifies the compact picker on a mount already showing the root", async () => {
      transition(PANEL_HIDDEN, ROOT_VISIBLE);
      await flush();
      expect(shownCalls).toEqual([compact]);
    });

    it("notifies the full picker when the themes subpanel opens", async () => {
      transition(ROOT_VISIBLE, THEMES_VISIBLE);
      await flush();
      expect(shownCalls).toEqual([full]);
    });

    it("notifies the full picker when the panel reopens with the themes subpanel still open", async () => {
      transition(
        {
          ...HIDDEN,
          activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
        },
        THEMES_VISIBLE
      );
      await flush();
      expect(shownCalls).toEqual([full]);
    });

    it("does not notify the full picker while the panel is hidden", async () => {
      transition(HIDDEN, {
        ...HIDDEN,
        activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
      });
      await flush();
      expect(shownCalls).toHaveLength(0);
    });

    it("does nothing on a re-render with no transition", async () => {
      transition(ROOT_VISIBLE, ROOT_VISIBLE);
      transition(THEMES_VISIBLE, THEMES_VISIBLE);
      await flush();
      expect(shownCalls).toHaveLength(0);
    });

    it("drops the compact call when the root is covered by the time the element is ready", async () => {
      let current = ROOT_VISIBLE;
      notifyThemePickersOnTransition(container, HIDDEN, () => current);
      current = {
        ...ROOT_VISIBLE,
        activeSubpanel: CUSTOMIZE_SUBPANELS.WALLPAPERS,
      };
      await flush();
      expect(shownCalls).toHaveLength(0);
    });

    it("drops the full call when the themes subpanel closed by the time the element is ready", async () => {
      let current = THEMES_VISIBLE;
      notifyThemePickersOnTransition(container, ROOT_VISIBLE, () => current);
      current = ROOT_VISIBLE;
      await flush();
      expect(shownCalls).toHaveLength(0);
    });
  });
});
