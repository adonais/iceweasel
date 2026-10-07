/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, createEvent, fireEvent, render } from "@testing-library/react";
import {
  SearchShortcutsForm,
  SelectableSearchShortcut,
} from "content-src/components/TopSites/SearchShortcutsForm";
import React from "react";

function renderForm(customProps = {}) {
  const defaultProps = {
    dispatch: jest.fn(),
    onClose: jest.fn(),
    TopSites: {
      rows: [],
      searchShortcuts: [],
    },
  };
  const props = { ...defaultProps, ...customProps };
  return { props, ...render(<SearchShortcutsForm {...props} />) };
}

describe("<SearchShortcutsForm>", () => {
  let container;
  let rerender;
  let dispatchStub;
  let instanceRef;

  beforeEach(() => {
    dispatchStub = jest.fn();
    instanceRef = React.createRef();
    const defaultProps = { rows: [], searchShortcuts: [] };
    ({ container, rerender } = render(
      <SearchShortcutsForm
        ref={instanceRef}
        TopSites={defaultProps}
        dispatch={dispatchStub}
      />
    ));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render", () => {
    expect(container.firstChild).toBeInTheDocument();
    expect(container.querySelector(".topsite-form")).toBeInTheDocument();
  });

  it("should render SelectableSearchShortcut components", () => {
    act(() => {
      instanceRef.current.setState({
        shortcuts: [{ keyword: "@a" }, { keyword: "@b" }],
      });
    });

    const shortcutsWrapper = container.querySelector(
      ".search-shortcuts-container div"
    );
    expect(shortcutsWrapper.children).toHaveLength(2);
    expect(shortcutsWrapper.children[0]).toHaveClass("search-shortcut");
  });

  it("should render SelectableSearchShortcut components", () => {
    const onCloseStub = jest.fn();
    act(() => {
      instanceRef.current.setState({
        shortcuts: [{ keyword: "@a" }, { keyword: "@b" }],
      });
    });
    rerender(
      <SearchShortcutsForm
        ref={instanceRef}
        TopSites={{ rows: [], searchShortcuts: [] }}
        dispatch={dispatchStub}
        onClose={onCloseStub}
      />
    );

    const doneButton = container.querySelector(".done");
    const clickEvent = createEvent.click(doneButton);
    const preventDefaultSpy = jest.spyOn(clickEvent, "preventDefault");
    fireEvent(doneButton, clickEvent);

    expect(dispatchStub).toHaveBeenCalledTimes(1);
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(onCloseStub).toHaveBeenCalledTimes(1);
  });

  it("should close without dispatching when the cancel button is clicked", () => {
    const { props, container: formContainer } = renderForm();

    fireEvent.click(formContainer.querySelector(".cancel"));

    expect(props.dispatch).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("<SelectableSearchShortcut>", () => {
  const shortcut = {
    keyword: "@google",
    shortURL: "google",
    tippyTopIcon: "google.png",
  };

  it("should render a checkbox reflecting the selected prop", () => {
    const { container } = render(
      <SelectableSearchShortcut
        shortcut={shortcut}
        selected={true}
        onChange={jest.fn()}
      />
    );

    const checkbox = container.querySelector("input[type='checkbox']");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(true);
    expect(container.querySelector(".title span").textContent).toBe("@google");
  });

  it("should call onChange when the checkbox is toggled", () => {
    const onChange = jest.fn();
    const { container } = render(
      <SelectableSearchShortcut
        shortcut={shortcut}
        selected={false}
        onChange={onChange}
      />
    );

    fireEvent.click(container.querySelector("input[type='checkbox']"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
