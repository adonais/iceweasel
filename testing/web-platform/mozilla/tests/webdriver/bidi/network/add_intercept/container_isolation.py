import pytest
from bidi.support.container_isolation import container_isolation
from webdriver.bidi.error import UnsupportedOperationException

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_add_intercept(bidi_session):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.network.add_intercept(phases=["beforeRequestSent"])
