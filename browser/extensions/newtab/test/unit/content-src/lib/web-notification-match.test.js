import {
  getNotificationIdsForUrl,
  isWebNotificationsEnabled,
  notificationKeyForUrl,
  originFromUrl,
} from "content-src/lib/web-notification-match.mjs";

describe("web-notification-match", () => {
  describe("originFromUrl", () => {
    it("returns the http(s) origin", () => {
      assert.equal(
        originFromUrl("https://mail.google.com/mail/u/0"),
        "https://mail.google.com"
      );
    });
    it("returns null for non-http(s) schemes", () => {
      assert.isNull(originFromUrl("about:newtab"));
      assert.isNull(originFromUrl("chrome://browser/content"));
    });
    it("returns null for malformed input", () => {
      assert.isNull(originFromUrl("not a url"));
    });
  });

  describe("notificationKeyForUrl", () => {
    it("redirects a known apex to its app origin", () => {
      assert.equal(
        notificationKeyForUrl("https://gmail.com"),
        "https://mail.google.com"
      );
      assert.equal(
        notificationKeyForUrl("https://www.slack.com/"),
        "https://app.slack.com"
      );
    });
    it("passes unknown origins through unchanged", () => {
      assert.equal(
        notificationKeyForUrl("https://example.com/x"),
        "https://example.com"
      );
    });
    it("does not merge sibling subdomains onto one key", () => {
      assert.equal(
        notificationKeyForUrl("https://calendar.google.com"),
        "https://calendar.google.com"
      );
    });
    it("returns null for non-http(s) urls", () => {
      assert.isNull(notificationKeyForUrl("about:blank"));
    });
  });

  describe("getNotificationIdsForUrl", () => {
    const state = {
      WebNotifications: {
        byOrigin: {
          "https://mail.google.com": ["a", "b"],
          "https://example.com": ["c"],
        },
      },
    };
    it("resolves ids through the apex alias", () => {
      assert.deepEqual(getNotificationIdsForUrl(state, "https://gmail.com"), [
        "a",
        "b",
      ]);
    });
    it("resolves ids for an exact origin", () => {
      assert.deepEqual(
        getNotificationIdsForUrl(state, "https://example.com/path"),
        ["c"]
      );
    });
    it("returns a stable empty array for an unmatched url", () => {
      const first = getNotificationIdsForUrl(state, "https://nobody.example");
      assert.deepEqual(first, []);
      assert.strictEqual(
        first,
        getNotificationIdsForUrl(state, "https://other.example")
      );
    });
    it("returns empty for a non-http(s) url", () => {
      assert.deepEqual(getNotificationIdsForUrl(state, "about:newtab"), []);
    });
  });

  describe("isWebNotificationsEnabled", () => {
    const stateWith = values => ({ Prefs: { values } });

    it("is enabled when the system and user prefs are set", () => {
      assert.isTrue(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": true,
            showWebNotifications: true,
          })
        )
      );
    });

    it("is enabled via trainhop with the system pref off", () => {
      assert.isTrue(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": false,
            showWebNotifications: true,
            trainhopConfig: { webNotifications: { enabled: true } },
          })
        )
      );
    });

    it("is disabled when the user pref is off even if trainhop enables it", () => {
      assert.isFalse(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": false,
            showWebNotifications: false,
            trainhopConfig: { webNotifications: { enabled: true } },
          })
        )
      );
    });

    it("is disabled when neither the system pref nor trainhop enable it", () => {
      assert.isFalse(
        isWebNotificationsEnabled(
          stateWith({
            "system.showWebNotifications": false,
            showWebNotifications: true,
          })
        )
      );
    });
  });
});
