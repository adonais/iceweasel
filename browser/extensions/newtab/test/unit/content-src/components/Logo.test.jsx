import { shallow } from "enzyme";
import React from "react";
import { Logo } from "content-src/components/Logo/Logo";

describe("<Logo>", () => {
  it("should render the logo wrapper", () => {
    const wrapper = shallow(<Logo />);
    assert.ok(wrapper.find("h1.logo-and-wordmark-wrapper").exists());
    assert.ok(wrapper.find("div.logo-and-wordmark").exists());
    assert.ok(wrapper.find("div.logo").exists());
    assert.ok(wrapper.find("div.wordmark").exists());
  });
});
