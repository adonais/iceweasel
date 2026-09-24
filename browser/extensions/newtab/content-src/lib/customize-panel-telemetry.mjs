/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionCreators as ac } from "../../common/Actions.mjs";

export function getCustomizePanelTransitions(prevProps, props) {
  const panelOpened = Boolean(props.showing && !prevProps.showing);
  const subpanelOpened =
    props.showing &&
    props.activeSubpanel &&
    (panelOpened || prevProps.activeSubpanel !== props.activeSubpanel)
      ? props.activeSubpanel
      : null;
  return { panelOpened, subpanelOpened };
}

export function recordCustomizePanelTransitions(dispatch, prevProps, props) {
  const { panelOpened, subpanelOpened } = getCustomizePanelTransitions(
    prevProps,
    props
  );
  if (panelOpened) {
    dispatch(ac.UserEvent({ event: "SHOW_PERSONALIZE" }));
  }
  if (subpanelOpened) {
    dispatch(
      ac.UserEvent({
        event: "SHOW_PERSONALIZE_SUBPANEL",
        source: subpanelOpened,
      })
    );
  }
}
