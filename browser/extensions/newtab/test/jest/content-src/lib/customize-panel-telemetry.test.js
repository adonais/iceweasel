/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionCreators as ac } from "common/Actions.mjs";
import { CUSTOMIZE_SUBPANELS } from "content-src/lib/constants";
import {
  getCustomizePanelTransitions,
  recordCustomizePanelTransitions,
} from "content-src/lib/customize-panel-telemetry";

describe("customize-panel-telemetry", () => {
  it("uses the panel ids documented in metrics.yaml", () => {
    expect(Object.values(CUSTOMIZE_SUBPANELS).sort()).toEqual([
      "sections_management",
      "themes_management",
      "wallpaper_categories",
      "widgets_management",
    ]);
  });

  describe("getCustomizePanelTransitions", () => {
    const OPEN = { showing: true, activeSubpanel: null };
    const CLOSED = { showing: false, activeSubpanel: null };

    it("reports a panel open when showing turns on", () => {
      expect(getCustomizePanelTransitions(CLOSED, OPEN)).toEqual({
        panelOpened: true,
        subpanelOpened: null,
      });
    });

    it("reports a subpanel open when one becomes active while showing", () => {
      expect(
        getCustomizePanelTransitions(OPEN, {
          ...OPEN,
          activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
        })
      ).toEqual({
        panelOpened: false,
        subpanelOpened: CUSTOMIZE_SUBPANELS.THEMES,
      });
    });

    it("reports both when the panel opens straight into a subpanel", () => {
      expect(
        getCustomizePanelTransitions(CLOSED, {
          showing: true,
          activeSubpanel: CUSTOMIZE_SUBPANELS.WIDGETS,
        })
      ).toEqual({
        panelOpened: true,
        subpanelOpened: CUSTOMIZE_SUBPANELS.WIDGETS,
      });
    });

    it("reports a switch from one subpanel to another as an open of the new one", () => {
      expect(
        getCustomizePanelTransitions(
          { ...OPEN, activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES },
          { ...OPEN, activeSubpanel: CUSTOMIZE_SUBPANELS.WALLPAPERS }
        )
      ).toEqual({
        panelOpened: false,
        subpanelOpened: CUSTOMIZE_SUBPANELS.WALLPAPERS,
      });
    });

    it("reports nothing when a subpanel changes while the panel is hidden", () => {
      expect(
        getCustomizePanelTransitions(CLOSED, {
          ...CLOSED,
          activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
        })
      ).toEqual({ panelOpened: false, subpanelOpened: null });
    });

    it("reports nothing on a re-render with the same subpanel open", () => {
      const themesOpen = {
        ...OPEN,
        activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES,
      };
      expect(getCustomizePanelTransitions(themesOpen, themesOpen)).toEqual({
        panelOpened: false,
        subpanelOpened: null,
      });
    });

    it("reports nothing on a re-render, on close, or on back to the root", () => {
      expect(getCustomizePanelTransitions(OPEN, OPEN)).toEqual({
        panelOpened: false,
        subpanelOpened: null,
      });
      expect(getCustomizePanelTransitions(OPEN, CLOSED)).toEqual({
        panelOpened: false,
        subpanelOpened: null,
      });
      expect(
        getCustomizePanelTransitions(
          { ...OPEN, activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES },
          OPEN
        )
      ).toEqual({ panelOpened: false, subpanelOpened: null });
    });

    it("reports a panel open and its subpanel when the panel reopens before the subpanel resets", () => {
      expect(
        getCustomizePanelTransitions(
          { showing: false, activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES },
          { showing: true, activeSubpanel: CUSTOMIZE_SUBPANELS.THEMES }
        )
      ).toEqual({
        panelOpened: true,
        subpanelOpened: CUSTOMIZE_SUBPANELS.THEMES,
      });
    });
  });

  describe("recordCustomizePanelTransitions", () => {
    it("dispatches the matching user events", () => {
      const dispatch = jest.fn();
      recordCustomizePanelTransitions(
        dispatch,
        { showing: false, activeSubpanel: null },
        { showing: true, activeSubpanel: CUSTOMIZE_SUBPANELS.WIDGETS }
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.UserEvent({ event: "SHOW_PERSONALIZE" })
      );
      expect(dispatch).toHaveBeenCalledWith(
        ac.UserEvent({
          event: "SHOW_PERSONALIZE_SUBPANEL",
          source: CUSTOMIZE_SUBPANELS.WIDGETS,
        })
      );
    });

    it("dispatches nothing without a transition", () => {
      const dispatch = jest.fn();
      const props = { showing: true, activeSubpanel: null };
      recordCustomizePanelTransitions(dispatch, props, props);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
