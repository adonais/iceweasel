import pytest
from webdriver.bidi.error import UnsupportedOperationException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_get_realms(bidi_session):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.script.get_realms()
