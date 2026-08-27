/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { render, fireEvent } from "@testing-library/react";
import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { _ConfirmDialog as ConfirmDialog } from "content-src/components/ConfirmDialog/ConfirmDialog";
import React from "react";

describe("<ConfirmDialog>", () => {
  let container;
  let dispatch;
  let ConfirmDialogProps;
  // White-box handle on the rendered instance, used to reach dialogRef.current
  // (the legacy test read it via wrapper.instance().dialogRef.current).
  let componentRef;
  beforeEach(() => {
    dispatch = jest.fn();
    componentRef = React.createRef();
    ConfirmDialogProps = {
      visible: true,
      data: {
        onConfirm: [],
        cancel_button_string_id: "newtab-topsites-delete-history-button",
        confirm_button_string_id: "newtab-topsites-cancel-button",
        eventSource: "HIGHLIGHTS",
      },
    };
    // jsdom does not implement <dialog>.showModal()/close(), which the
    // component calls from componentDidUpdate. Stub them as no-ops so they do
    // not emit a "Not implemented" console.error under jsdom.
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    ({ container } = render(
      <ConfirmDialog
        ref={componentRef}
        dispatch={dispatch}
        {...ConfirmDialogProps}
      />
    ));
  });
  it("should render an overlay", () => {
    expect(container.querySelector("dialog")).toBeInTheDocument();
  });
  it("should render a modal", () => {
    expect(container.querySelector(".confirmation-dialog")).toBeInTheDocument();
  });
  it("should not render if visible is false", () => {
    ConfirmDialogProps.visible = false;
    ({ container } = render(
      <ConfirmDialog dispatch={dispatch} {...ConfirmDialogProps} />
    ));

    expect(container.querySelectorAll("dialog")).toHaveLength(1);
  });
  it("should display an icon if we provide one in props", () => {
    const iconName = "modal-icon";
    // If there is no icon in the props, we shouldn't display an icon
    expect(container.querySelectorAll(`.icon-${iconName}`)).toHaveLength(0);

    ConfirmDialogProps.data.icon = iconName;
    ({ container } = render(
      <ConfirmDialog dispatch={dispatch} {...ConfirmDialogProps} />
    ));

    // But if we do provide an icon - we should show it
    expect(container.querySelectorAll(`.icon-${iconName}`)).toHaveLength(1);
  });
  describe("fluent message check", () => {
    it("should render the message body sent via props", () => {
      Object.assign(ConfirmDialogProps.data, {
        body_string_id: ["foo", "bar"],
      });
      ({ container } = render(
        <ConfirmDialog dispatch={dispatch} {...ConfirmDialogProps} />
      ));
      const msgs = container.querySelectorAll(".modal-message p");
      expect(msgs.length).toEqual(
        ConfirmDialogProps.data.body_string_id.length
      );
      msgs.forEach((fm, i) =>
        expect(fm.getAttribute("data-l10n-id")).toEqual(
          ConfirmDialogProps.data.body_string_id[i]
        )
      );
    });
    it("should render the correct primary button text", () => {
      Object.assign(ConfirmDialogProps.data, {
        confirm_button_string_id: "primary_foo",
      });
      ({ container } = render(
        <ConfirmDialog dispatch={dispatch} {...ConfirmDialogProps} />
      ));

      const doneLabel = container.querySelector(
        "moz-button[type='destructive']"
      );
      expect(doneLabel).toBeInTheDocument();
      expect(doneLabel.getAttribute("data-l10n-id")).toEqual(
        ConfirmDialogProps.data.confirm_button_string_id
      );
    });
  });
  describe("click events", () => {
    it("should emit AlsoToMain DIALOG_CANCEL when you click the overlay", () => {
      const dialog = container.querySelector("dialog");

      expect(dialog).toBeInTheDocument();
      fireEvent.click(componentRef.current.dialogRef.current);

      // Two events are emitted: UserEvent+AlsoToMain.
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toHaveProperty(
        "type",
        at.DIALOG_CANCEL
      );
      expect(dispatch).toHaveBeenCalledWith({ type: at.DIALOG_CANCEL });
    });
    it("should emit UserEvent DIALOG_CANCEL when you click the overlay", () => {
      const dialog = container.querySelector("dialog");

      expect(dialog).toBeTruthy();
      fireEvent.click(componentRef.current.dialogRef.current);

      // Two events are emitted: UserEvent+AlsoToMain.
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[1][0].type).toBe(at.TELEMETRY_USER_EVENT);
      expect(dispatch).toHaveBeenCalledWith(
        ac.UserEvent({ event: at.DIALOG_CANCEL, source: "HIGHLIGHTS" })
      );
    });
    it("should emit AlsoToMain DIALOG_CANCEL on cancel", () => {
      const cancelButton = container.querySelector("moz-button[type='ghost']");

      expect(cancelButton).toBeTruthy();
      fireEvent.click(cancelButton);

      // Two events are emitted: UserEvent+AlsoToMain.
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toHaveProperty(
        "type",
        at.DIALOG_CANCEL
      );
      expect(dispatch).toHaveBeenCalledWith({ type: at.DIALOG_CANCEL });
    });
    it("should emit UserEvent DIALOG_CANCEL on cancel", () => {
      const cancelButton = container.querySelector("moz-button[type='ghost']");

      expect(cancelButton).toBeTruthy();
      fireEvent.click(cancelButton);

      // Two events are emitted: UserEvent+AlsoToMain.
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[1][0].type).toBe(at.TELEMETRY_USER_EVENT);
      expect(dispatch).toHaveBeenCalledWith(
        ac.UserEvent({ event: at.DIALOG_CANCEL, source: "HIGHLIGHTS" })
      );
    });
    it("should emit UserEvent on primary button", () => {
      Object.assign(ConfirmDialogProps.data, {
        body_string_id: ["foo", "bar"],
        onConfirm: [
          ac.AlsoToMain({ type: at.DELETE_URL, data: "foo.bar" }),
          ac.UserEvent({ event: "DELETE" }),
        ],
      });
      ({ container } = render(
        <ConfirmDialog dispatch={dispatch} {...ConfirmDialogProps} />
      ));
      const doneButton = container.querySelector(
        "moz-button[type='destructive']"
      );

      expect(doneButton).toBeTruthy();
      fireEvent.click(doneButton);

      // Two events are emitted: UserEvent+AlsoToMain.
      expect(dispatch.mock.calls[1][0].type).toBe(at.TELEMETRY_USER_EVENT);

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[1][0]).toEqual(
        ConfirmDialogProps.data.onConfirm[1]
      );
    });
    it("should emit AlsoToMain on primary button", () => {
      Object.assign(ConfirmDialogProps.data, {
        body_string_id: ["foo", "bar"],
        onConfirm: [
          ac.AlsoToMain({ type: at.DELETE_URL, data: "foo.bar" }),
          ac.UserEvent({ event: "DELETE" }),
        ],
      });
      ({ container } = render(
        <ConfirmDialog dispatch={dispatch} {...ConfirmDialogProps} />
      ));
      const doneButton = container.querySelector(
        "moz-button[type='destructive']"
      );

      expect(doneButton).toBeTruthy();
      fireEvent.click(doneButton);

      // Two events are emitted: UserEvent+AlsoToMain.
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch.mock.calls[0][0]).toEqual(
        ConfirmDialogProps.data.onConfirm[0]
      );
    });
  });
});
