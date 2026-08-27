import { proxiedIconUrl } from "content-src/lib/web-notification-icon.mjs";

describe("web-notification-icon", () => {
  describe("proxiedIconUrl", () => {
    it("routes an https icon through the image proxy", () => {
      const url = proxiedIconUrl("https://example.com/icon.png");
      assert.include(url, "https://img-getpocket.cdn.mozilla.net/");
      assert.include(url, encodeURIComponent("https://example.com/icon.png"));
    });

    it("requests 2x the rendered size and strips exif", () => {
      const url = proxiedIconUrl("https://example.com/icon.png");
      assert.include(url, "/64x64/");
      assert.include(url, "strip_exif()");
      assert.include(url, "no_upscale()");
    });

    it("encodes an icon url containing a query string", () => {
      const icon = "https://example.com/i?size=1&v=2";
      const url = proxiedIconUrl(icon);
      assert.include(url, encodeURIComponent(icon));
      // The origin url must not leak out of its encoded segment.
      assert.notInclude(url, "?size=1");
    });

    it("returns null for a non-https icon rather than passing it through", () => {
      assert.isNull(proxiedIconUrl("http://example.com/icon.png"));
      assert.isNull(proxiedIconUrl("data:image/png;base64,AAAA"));
    });

    it("returns null for missing or malformed input", () => {
      assert.isNull(proxiedIconUrl(undefined));
      assert.isNull(proxiedIconUrl(""));
      assert.isNull(proxiedIconUrl("not a url"));
    });
  });
});
