/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { proxiedIconUrl } from "content-src/lib/web-notification-icon.mjs";

describe("web-notification-icon", () => {
  describe("proxiedIconUrl", () => {
    it("routes an https icon through the image proxy", () => {
      const url = proxiedIconUrl("https://example.com/icon.png");
      expect(url).toContain("https://img-getpocket.cdn.mozilla.net/");
      expect(url).toContain(encodeURIComponent("https://example.com/icon.png"));
    });

    it("requests 2x the rendered size and strips exif", () => {
      const url = proxiedIconUrl("https://example.com/icon.png");
      expect(url).toContain("/64x64/");
      expect(url).toContain("strip_exif()");
      expect(url).toContain("no_upscale()");
    });

    it("encodes an icon url containing a query string", () => {
      const icon = "https://example.com/i?size=1&v=2";
      const url = proxiedIconUrl(icon);
      expect(url).toContain(encodeURIComponent(icon));
      // The origin url must not leak out of its encoded segment.
      expect(url).not.toContain("?size=1");
    });

    it("returns null for a non-https icon rather than passing it through", () => {
      // eslint-disable-next-line sdl/no-insecure-url
      expect(proxiedIconUrl("http://example.com/icon.png")).toBeNull();
      expect(proxiedIconUrl("data:image/png;base64,AAAA")).toBeNull();
    });

    it("returns null for missing or malformed input", () => {
      expect(proxiedIconUrl(undefined)).toBeNull();
      expect(proxiedIconUrl("")).toBeNull();
      expect(proxiedIconUrl("not a url")).toBeNull();
    });
  });
});
