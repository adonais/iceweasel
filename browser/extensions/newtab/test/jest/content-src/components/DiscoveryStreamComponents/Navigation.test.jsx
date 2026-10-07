/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { act, render } from "@testing-library/react";
import {
  Navigation,
  Topic,
} from "content-src/components/DiscoveryStreamComponents/Navigation/Navigation";
import React from "react";

const DEFAULT_PROPS = {
  App: {
    isForStartupCache: false,
  },
};

describe("<Navigation>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = render(<Navigation header={{}} locale="en-US" />);
  });

  it("should render", () => {
    expect(
      wrapper.container.querySelector(".ds-navigation")
    ).toBeInTheDocument();
  });

  it("should render a title", () => {
    wrapper.rerender(<Navigation header={{ title: "Foo" }} locale="en-US" />);

    expect(
      wrapper.container.querySelector(".ds-navigation-header").textContent
    ).toBe("Foo");
  });

  it("should not render a title", () => {
    wrapper.rerender(<Navigation header={null} locale="en-US" />);

    expect(
      wrapper.container.querySelectorAll(".ds-navigation-header")
    ).toHaveLength(0);
  });

  it("should set default alignment", () => {
    expect(
      wrapper.container.querySelectorAll(".ds-navigation-centered")
    ).toHaveLength(1);
  });

  it("should set custom alignment", () => {
    wrapper.rerender(
      <Navigation header={{}} locale="en-US" alignment="left-align" />
    );

    expect(
      wrapper.container.querySelectorAll(".ds-navigation-left-align")
    ).toHaveLength(1);
  });

  it("should set default of no links", () => {
    expect(wrapper.container.querySelectorAll("ul > li")).toHaveLength(0);
  });

  it("should render a FluentOrText", () => {
    wrapper.rerender(<Navigation header={{ title: "Foo" }} locale="en-US" />);

    expect(
      wrapper.container.querySelector(".ds-navigation").firstElementChild
    ).toHaveClass("ds-navigation-header");
  });

  it("should render 2 Topics", () => {
    wrapper.rerender(
      <Navigation
        header={{}}
        locale="en-US"
        links={[
          { url: "https://foo.com", name: "foo" },
          { url: "https://bar.com", name: "bar" },
        ]}
      />
    );

    expect(wrapper.container.querySelectorAll("ul > li")).toHaveLength(2);
  });

  it("should render 2 extra Topics", () => {
    wrapper.rerender(
      <Navigation
        header={{}}
        locale="en-US"
        newFooterSection={true}
        links={[
          { url: "https://foo.com", name: "foo" },
          { url: "https://bar.com", name: "bar" },
        ]}
        extraLinks={[
          { url: "https://baz.com", name: "baz" },
          { url: "https://qux.com", name: "qux" },
        ]}
      />
    );

    expect(wrapper.container.querySelectorAll("ul > li")).toHaveLength(4);
  });
});

describe("<Topic>", () => {
  let wrapper;
  let topicRef;

  beforeEach(() => {
    topicRef = React.createRef();
    wrapper = render(<Topic url="https://foo.com" name="foo" ref={topicRef} />);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should pass onLinkClick prop", () => {
    expect(typeof topicRef.current.onLinkClick).toBe("function");
  });

  it("should render", () => {
    expect(wrapper.container.querySelector("a")).toBeInTheDocument();
  });

  describe("onLinkClick", () => {
    let dispatch;

    beforeEach(() => {
      dispatch = jest.fn();
      topicRef = React.createRef();
      render(<Topic dispatch={dispatch} ref={topicRef} {...DEFAULT_PROPS} />);
      act(() => {
        topicRef.current.setState({ isSeen: true });
      });
    });

    it("should call dispatch", () => {
      topicRef.current.onLinkClick({ target: { text: `Must Reads` } });

      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
