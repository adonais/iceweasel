import pytest
from webdriver.bidi.error import (
    NoSuchFrameException,
    NoSuchUserContextException,
    UnsupportedOperationException,
)

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_global(bidi_session):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.session.subscribe(events=["browsingContext.load"])


async def test_user_contexts(bidi_session, session_user_context):
    result = await bidi_session.session.subscribe(
        events=["browsingContext.load"], user_contexts=[session_user_context]
    )

    await bidi_session.session.unsubscribe(subscriptions=[result["subscription"]])


async def test_user_contexts_outside_container(bidi_session):
    with pytest.raises(NoSuchUserContextException):
        await bidi_session.session.subscribe(
            events=["browsingContext.load"], user_contexts=["default"]
        )


async def test_contexts(bidi_session, new_tab):
    result = await bidi_session.session.subscribe(
        events=["browsingContext.load"], contexts=[new_tab["context"]]
    )

    await bidi_session.session.unsubscribe(subscriptions=[result["subscription"]])


async def test_contexts_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.session.subscribe(
            events=["browsingContext.load"], contexts=[tab_outside_container]
        )
