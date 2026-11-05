import pytest
from webdriver.bidi.error import (
    NoSuchUserContextException,
    UnsupportedOperationException,
)

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_global(bidi_session):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browser.set_download_behavior(download_behavior=None)


async def test_user_contexts(bidi_session, session_user_context):
    await bidi_session.browser.set_download_behavior(
        download_behavior=None, user_contexts=[session_user_context]
    )


async def test_user_contexts_outside_container(bidi_session):
    with pytest.raises(NoSuchUserContextException):
        await bidi_session.browser.set_download_behavior(
            download_behavior=None, user_contexts=["default"]
        )
