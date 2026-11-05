import pytest
from webdriver.bidi.error import UnsupportedOperationException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_get_client_windows(bidi_session):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browser.get_client_windows()
