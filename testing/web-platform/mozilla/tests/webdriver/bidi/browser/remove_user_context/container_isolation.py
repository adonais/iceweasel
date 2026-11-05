import pytest
from webdriver.bidi.error import UnsupportedOperationException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_remove_user_context(bidi_session, session_user_context):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browser.remove_user_context(
            user_context=session_user_context
        )
