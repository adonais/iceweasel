import {
  Localized,
  pickConfigurableStyles,
  resolveImageSrc,
} from "content-src/components/MSLocalized";
import React from "react";
import { shallow } from "enzyme";

describe("<MSLocalized>", () => {
  it("should render span with no children", () => {
    const shallowWrapper = shallow(<Localized text="test" />);

    assert.ok(shallowWrapper.find("span").exists());
    assert.equal(shallowWrapper.text(), "test");
  });
  it("should render span when using string_id with no children", () => {
    const shallowWrapper = shallow(
      <Localized text={{ string_id: "test_id" }} />
    );

    assert.ok(shallowWrapper.find("span[data-l10n-id='test_id']").exists());
  });
  it("should render text inside child", () => {
    const shallowWrapper = shallow(
      <Localized text="test">
        <div />
      </Localized>
    );

    assert.ok(shallowWrapper.find("div").text(), "test");
  });
  it("should use l10n id on child", () => {
    const shallowWrapper = shallow(
      <Localized text={{ string_id: "test_id" }}>
        <div />
      </Localized>
    );

    assert.ok(shallowWrapper.find("div[data-l10n-id='test_id']").exists());
  });
  it("should keep original children", () => {
    const shallowWrapper = shallow(
      <Localized text={{ string_id: "test_id" }}>
        <h1>
          <span data-l10n-name="test" />
        </h1>
      </Localized>
    );

    assert.ok(shallowWrapper.find("span[data-l10n-name='test']").exists());
  });
  it("should render inline icons from config", () => {
    const shallowWrapper = shallow(
      <Localized
        text={{
          string_id: "test_id",
          inline_icons: {
            "my-icon": { imageURL: "chrome://test.svg" },
          },
        }}
      >
        <p />
      </Localized>
    );

    const img = shallowWrapper.find("img[data-l10n-name='my-icon']");
    assert.ok(img.exists());
    assert.equal(img.prop("src"), "chrome://test.svg");
    assert.equal(img.prop("className"), "inline-icon");
  });
  it("should use imageURL in LTR", () => {
    const shallowWrapper = shallow(
      <Localized
        text={{
          string_id: "test_id",
          inline_icons: {
            "my-icon": {
              imageURL: "chrome://ltr.svg",
              rtlImageURL: "chrome://rtl.svg",
            },
          },
        }}
      >
        <p />
      </Localized>
    );

    assert.equal(
      shallowWrapper.find("img[data-l10n-name='my-icon']").prop("src"),
      "chrome://ltr.svg"
    );
  });
  it("should use rtlImageURL in RTL", () => {
    document.documentElement.setAttribute("dir", "rtl");
    const shallowWrapper = shallow(
      <Localized
        text={{
          string_id: "test_id",
          inline_icons: {
            "my-icon": {
              imageURL: "chrome://ltr.svg",
              rtlImageURL: "chrome://rtl.svg",
            },
          },
        }}
      >
        <p />
      </Localized>
    );

    assert.equal(
      shallowWrapper.find("img[data-l10n-name='my-icon']").prop("src"),
      "chrome://rtl.svg"
    );
    document.documentElement.removeAttribute("dir");
  });
  it("should apply CONFIGURABLE_STYLES from text to the child style", () => {
    const shallowWrapper = shallow(
      <Localized text={{ raw: "test", color: "red", fontSize: "1em" }}>
        <p />
      </Localized>
    );

    const style = shallowWrapper.find("p").prop("style");
    assert.strictEqual(style.color, "red");
    assert.strictEqual(style.fontSize, "1em");
  });
  it("should ignore unsupported style props on text", () => {
    const shallowWrapper = shallow(
      <Localized text={{ raw: "test", notAStyleProp: "purple" }}>
        <p />
      </Localized>
    );

    assert.notProperty(shallowWrapper.find("p").prop("style"), "notAStyleProp");
  });
});

describe("pickConfigurableStyles", () => {
  it("should pick only CONFIGURABLE_STYLES entries present on the source", () => {
    const style = pickConfigurableStyles({
      color: "red",
      fontSize: "1em",
      notAStyleProp: "purple",
    });

    assert.deepEqual(style, { color: "red", fontSize: "1em" });
  });
  it("should return an empty object when no configurable styles are present", () => {
    assert.deepEqual(pickConfigurableStyles({ notAStyleProp: "purple" }), {});
  });
});

describe("resolveImageSrc", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("dir");
  });

  it("should return imageURL in LTR", () => {
    assert.strictEqual(
      resolveImageSrc({
        imageURL: "chrome://ltr.svg",
        rtlImageURL: "chrome://rtl.svg",
      }),
      "chrome://ltr.svg"
    );
  });
  it("should return rtlImageURL in RTL when provided", () => {
    document.documentElement.setAttribute("dir", "rtl");
    assert.strictEqual(
      resolveImageSrc({
        imageURL: "chrome://ltr.svg",
        rtlImageURL: "chrome://rtl.svg",
      }),
      "chrome://rtl.svg"
    );
  });
  it("should fall back to imageURL in RTL when rtlImageURL is not provided", () => {
    document.documentElement.setAttribute("dir", "rtl");
    assert.strictEqual(
      resolveImageSrc({ imageURL: "chrome://ltr.svg" }),
      "chrome://ltr.svg"
    );
  });
});
