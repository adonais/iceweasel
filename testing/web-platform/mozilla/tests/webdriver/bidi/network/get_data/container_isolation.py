import pytest
from bidi.support.container_isolation import container_isolation
from webdriver.bidi.modules.script import ContextTarget

pytestmark = [pytest.mark.asyncio, container_isolation]

HEADERS_ECHO_PATH = "/webdriver/tests/support/http_handlers/headers_echo.py"


async def test_user_contexts(
    bidi_session,
    new_tab,
    session_user_context,
    url,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url(HEADERS_ECHO_PATH), wait="complete"
    )
    await subscribe_events(
        events=["network.responseCompleted"], user_contexts=[session_user_context]
    )
    collector = await bidi_session.network.add_data_collector(
        data_types=["response"],
        max_encoded_data_size=10000,
        user_contexts=[session_user_context],
    )

    on_response_completed = wait_for_event("network.responseCompleted")
    await bidi_session.script.evaluate(
        expression=f"fetch('{url(HEADERS_ECHO_PATH)}').then(r => r.text())",
        target=ContextTarget(new_tab["context"]),
        await_promise=True,
    )
    event = await wait_for_future_safe(on_response_completed)

    data = await bidi_session.network.get_data(
        request=event["request"]["request"], data_type="response"
    )
    assert data["type"] == "string"
    assert "headers" in data["value"]

    await bidi_session.network.remove_data_collector(collector=collector)
