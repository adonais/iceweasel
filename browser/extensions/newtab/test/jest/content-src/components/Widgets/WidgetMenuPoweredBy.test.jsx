/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { WidgetMenuPoweredBy } from "content-src/components/Widgets/WidgetMenuPoweredBy";
import { actionTypes as at } from "common/Actions.mjs";

const renderPoweredBy = (props = {}) => {
  const dispatch = jest.fn();
  const recordUserAction = jest.fn();
  const { container } = render(
    <panel-list>
      <WidgetMenuPoweredBy
        dispatch={dispatch}
        url="https://example.com/"
        l10nId="newtab-example-menu-powered-by"
        recordUserAction={recordUserAction}
        userAction="powered_by_example"
        {...props}
      />
    </panel-list>
  );
  return { container, dispatch, recordUserAction };
};

describe("<WidgetMenuPoweredBy>", () => {
  it("opens the partner link in a new tab, records the action, then calls onClick", () => {
    const onClick = jest.fn();
    const { container, dispatch, recordUserAction } = renderPoweredBy({
      onClick,
    });
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-example-menu-powered-by']"
      )
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: at.OPEN_LINK,
      data: { url: "https://example.com/", where: "tab" },
    });
    expect(recordUserAction).toHaveBeenCalledWith("powered_by_example", {
      source: "context_menu",
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("still opens the link and records the action when no onClick is passed", () => {
    const { container, dispatch, recordUserAction } = renderPoweredBy();
    fireEvent.click(
      container.querySelector(
        "panel-item[data-l10n-id='newtab-example-menu-powered-by']"
      )
    );
    expect(dispatch.mock.calls[0][0].type).toBe(at.OPEN_LINK);
    expect(recordUserAction).toHaveBeenCalledTimes(1);
  });
});
