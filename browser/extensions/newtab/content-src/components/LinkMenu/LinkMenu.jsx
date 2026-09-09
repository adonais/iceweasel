/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { connect } from "react-redux";
import { ContextMenu } from "content-src/components/ContextMenu/ContextMenu";
import { getLinkMenuOptions } from "content-src/lib/link-menu-options";
import React from "react";

export class _LinkMenu extends React.PureComponent {
  getOptions() {
    return getLinkMenuOptions(this.props);
  }

  render() {
    return (
      <ContextMenu
        onUpdate={this.props.onUpdate}
        onShow={this.props.onShow}
        options={this.getOptions()}
        keyboardAccess={this.props.keyboardAccess}
      />
    );
  }
}

const getState = state => ({
  isPrivateBrowsingEnabled: state.Prefs.values.isPrivateBrowsingEnabled,
  platform: state.Prefs.values.platform,
  privacyInfoUrl: state.Prefs.values["privacyInfo.url"],
});
export const LinkMenu = connect(getState)(_LinkMenu);
