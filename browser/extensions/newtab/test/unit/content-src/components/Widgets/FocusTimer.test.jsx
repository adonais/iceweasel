import { FocusTimer } from "content-src/components/Widgets/FocusTimer/FocusTimer";
import React from "react";
import { mount } from "enzyme";

describe("<FocusTimer>", () => {
  let wrapper;

  beforeEach(() => {
    wrapper = mount(<FocusTimer />);
  });

  it("should render", () => {
    assert.ok(wrapper.exists());
    assert.ok(wrapper.find(".focus-timer-wrapper").exists());
  });
});
