/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useSelector } from "react-redux";
import { FeatureHighlight } from "./FeatureHighlight";

function WidgetsFeatureHighlight({ handleDismiss, handleBlock, dispatch }) {
  const { messageData } = useSelector(state => state.Messages);

  return (
    <FeatureHighlight
      position="inset-inline-center inset-block-end"
      arrowPosition="arrow-top-center"
      openedOverride={true}
      showButtonIcon={false}
      feature={messageData?.content?.feature}
      modalClassName="widget-highlight-wrapper"
      message={
        <div className="widget-highlight">
          <img
            src="chrome://newtab/content/data/content/assets/widget-message.png"
            alt=""
          />
          <h3 data-l10n-id="newtab-widget-message-title" />
          <p data-l10n-id="newtab-widget-message-copy" />
        </div>
      }
      dispatch={dispatch}
      dismissCallback={() => {
        handleDismiss();
        handleBlock();
      }}
      outsideClickCallback={handleDismiss}
    />
  );
}

export { WidgetsFeatureHighlight };
