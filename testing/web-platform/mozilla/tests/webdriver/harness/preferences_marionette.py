import pytest
from support.helpers import get_pref


@pytest.mark.geckodriver(allow_system_access=True)
def test_recommended_preferences(session):
    has_recommended_prefs = get_pref(session, "remote.prefs.recommended.applied")
    assert has_recommended_prefs is True
