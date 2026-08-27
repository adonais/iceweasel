import pytest
from support.context import set_context, using_context
from webdriver.error import UnsupportedOperationException


def test_set_context_chrome_without_system_access(session):
    with pytest.raises(UnsupportedOperationException):
        set_context(session, "chrome")


@pytest.mark.geckodriver(allow_system_access=True)
def test_set_context_chrome_with_system_access(session):
    with using_context(session, "chrome"):
        pass
