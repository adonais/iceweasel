/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, fireEvent, render } from "@testing-library/react";
import { WrapWithProvider } from "test/jest/test-utils";
import {
  ContextMenu,
  _ContextMenuItem,
} from "content-src/components/ContextMenu/ContextMenu";
import { ContextMenuButton } from "content-src/components/ContextMenu/ContextMenuButton";
import React from "react";

const DEFAULT_PROPS = {
  onUpdate: () => {},
  options: [],
  tabbableOptionsLength: 0,
};

const DEFAULT_MENU_OPTIONS = [
  "MoveUp",
  "MoveDown",
  "Separator",
  "ManageSection",
];

const FakeMenu = props => {
  return <div>{props.children}</div>;
};

describe("<ContextMenuButton>", () => {
  function renderButtonWithMenu(options) {
    const buttonRef = React.createRef();
    const menuRef = React.createRef();
    const utils = render(
      <WrapWithProvider>
        <ContextMenuButton ref={buttonRef}>
          <ContextMenu ref={menuRef} options={options} />
        </ContextMenuButton>
      </WrapWithProvider>
    );
    return { ...utils, buttonRef, menuRef };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should call onUpdate when clicked", () => {
    const onUpdate = jest.fn();
    const { container } = render(
      <ContextMenuButton onUpdate={onUpdate}>
        <FakeMenu />
      </ContextMenuButton>
    );
    fireEvent.click(container.querySelector(".context-menu-button"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("should call onUpdate when activated with Enter", () => {
    const onUpdate = jest.fn();
    const { container } = render(
      <ContextMenuButton onUpdate={onUpdate}>
        <FakeMenu />
      </ContextMenuButton>
    );
    fireEvent.keyDown(container.querySelector(".context-menu-button"), {
      key: "Enter",
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("should call onClick", () => {
    const onClick = jest.spyOn(ContextMenuButton.prototype, "onClick");
    const { container } = render(
      <ContextMenuButton>
        <FakeMenu />
      </ContextMenuButton>
    );
    fireEvent.click(container.querySelector("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should have a default keyboardAccess prop of false", () => {
    const { buttonRef, menuRef } = renderButtonWithMenu(DEFAULT_MENU_OPTIONS);
    act(() => {
      buttonRef.current.setState({ showContextMenu: true });
    });
    expect(menuRef.current.props.keyboardAccess).toBe(false);
  });

  it("should pass the keyboardAccess prop down to ContextMenu", () => {
    const { buttonRef, menuRef } = renderButtonWithMenu(DEFAULT_MENU_OPTIONS);
    act(() => {
      buttonRef.current.setState({
        showContextMenu: true,
        contextMenuKeyboard: true,
      });
    });
    expect(menuRef.current.props.keyboardAccess).toBe(true);
  });

  it("should call focusFirst when keyboardAccess is true", () => {
    const options = [{ label: "item1", first: true }];
    const { buttonRef } = renderButtonWithMenu(options);
    const focusFirst = jest.spyOn(_ContextMenuItem.prototype, "focusFirst");
    act(() => {
      buttonRef.current.setState({
        showContextMenu: true,
        contextMenuKeyboard: true,
      });
    });
    expect(focusFirst).toHaveBeenCalledTimes(1);
  });
});

describe("<ContextMenu>", () => {
  function renderContextMenu(props) {
    return render(
      <WrapWithProvider>
        <ContextMenu {...props} />
      </WrapWithProvider>
    );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render all the options provided", () => {
    const options = [
      { label: "item1" },
      { type: "separator" },
      { label: "item2" },
    ];
    const { container } = renderContextMenu({ ...DEFAULT_PROPS, options });
    expect(container.querySelector(".context-menu-list").children).toHaveLength(
      3
    );
  });

  it("should not add a link for a separator", () => {
    const options = [{ label: "item1" }, { type: "separator" }];
    const { container } = renderContextMenu({ ...DEFAULT_PROPS, options });
    expect(container.querySelectorAll(".separator")).toHaveLength(1);
  });

  it("should add a link for all types that are not separators", () => {
    const options = [{ label: "item1" }, { type: "separator" }];
    const { container } = renderContextMenu({ ...DEFAULT_PROPS, options });
    expect(container.querySelectorAll(".context-menu-item")).toHaveLength(1);
  });

  it("should not add an icon to any items", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      options: [{ label: "item1", icon: "icon1" }, { type: "separator" }],
    });
    const { container } = renderContextMenu(props);
    expect(container.querySelectorAll(".icon-icon1")).toHaveLength(0);
  });

  it("should be tabbable", () => {
    const props = {
      options: [{ label: "item1", icon: "icon1" }, { type: "separator" }],
    };
    const { container } = renderContextMenu(props);
    expect(container.querySelector(".context-menu-item")).toHaveAttribute(
      "role",
      "presentation"
    );
  });

  it("should call onUpdate with false when an option is clicked", () => {
    const onUpdate = jest.fn();
    const onClick = jest.fn();
    const props = Object.assign({}, DEFAULT_PROPS, {
      onUpdate,
      options: [{ label: "item1", onClick }],
    });
    const { container } = renderContextMenu(props);
    fireEvent.click(container.querySelector(".context-menu-item button"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should not have disabled className by default", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      options: [{ label: "item1", icon: "icon1" }, { type: "separator" }],
    });
    const { container } = renderContextMenu(props);
    expect(
      container.querySelectorAll(".context-menu-item a.disabled")
    ).toHaveLength(0);
  });

  it("should add disabled className to any disabled options", () => {
    const options = [
      { label: "item1", icon: "icon1", disabled: true },
      { type: "separator" },
    ];
    const props = Object.assign({}, DEFAULT_PROPS, { options });
    const { container } = renderContextMenu(props);
    expect(
      container.querySelectorAll(".context-menu-item button.disabled")
    ).toHaveLength(1);
  });

  it("should have the context-menu-item class", () => {
    const options = [{ label: "item1", icon: "icon1" }];
    const props = Object.assign({}, DEFAULT_PROPS, { options });
    const { container } = renderContextMenu(props);
    expect(container.querySelectorAll(".context-menu-item")).toHaveLength(1);
  });

  it("should set aria-haspopup when provided by the option", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      options: [{ label: "item1", ariaHasPopup: "dialog" }],
    });
    const { container } = renderContextMenu(props);
    expect(
      container.querySelector(".context-menu-item button")
    ).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("should call onClick when onKeyDown is called with Enter", () => {
    const onClick = jest.fn();
    const props = Object.assign({}, DEFAULT_PROPS, {
      options: [{ label: "item1", onClick }],
    });
    const { container } = renderContextMenu(props);
    fireEvent.keyDown(container.querySelector(".context-menu-item button"), {
      key: "Enter",
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should call focusSibling when onKeyDown is called with ArrowUp", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      options: [{ label: "item1" }],
    });
    const { container } = renderContextMenu(props);
    const focusSibling = jest
      .spyOn(_ContextMenuItem.prototype, "focusSibling")
      .mockImplementation(() => {});
    fireEvent.keyDown(container.querySelector(".context-menu-item button"), {
      key: "ArrowUp",
    });
    expect(focusSibling).toHaveBeenCalledTimes(1);
  });

  it("should call focusSibling when onKeyDown is called with ArrowDown", () => {
    const props = Object.assign({}, DEFAULT_PROPS, {
      options: [{ label: "item1" }],
    });
    const { container } = renderContextMenu(props);
    const focusSibling = jest
      .spyOn(_ContextMenuItem.prototype, "focusSibling")
      .mockImplementation(() => {});
    fireEvent.keyDown(container.querySelector(".context-menu-item button"), {
      key: "ArrowDown",
    });
    expect(focusSibling).toHaveBeenCalledTimes(1);
  });
});
