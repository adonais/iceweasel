from support.helpers import read_user_preferences
from tests.support.sync import Poll

RECOMMENDED_PREF = "remote.prefs.recommended.applied"


def test_remote_agent_recommended_preferences_not_persisted(browser):
    # Marionette cannot be enabled for this test because it will also set the
    # recommended preferences. Therefore only enable Remote Agent protocols.
    current_browser = browser(use_bidi=True)

    def pref_is_persisted(_):
        preferences = read_user_preferences(current_browser.profile.profile, "prefs.js")
        return RECOMMENDED_PREF in preferences

    # Recommended preferences are set on the default branch, which is never
    # serialized, and as such must not end up in the profile. A user branch
    # value gets flushed to prefs.js shortly after it was set, so wait long
    # enough that such a write would have been seen. Note that prefs.js does
    # not have to exist at all, in which case no preference was persisted.
    wait = Poll(None, timeout=5, ignored_exceptions=IOError, raises=None)

    assert not wait.until(pref_is_persisted), (
        f'Preference "{RECOMMENDED_PREF}" was written to prefs.js'
    )
