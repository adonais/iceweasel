import pytest
from tests.bidi.network import (
    PAGE_EMPTY_HTML,
    RESPONSE_COMPLETED_EVENT,
)
from webdriver.bidi import error


@pytest.mark.capabilities(
    {
        "moz:firefoxOptions": {
            "prefs": {
                "remote.network.maxTotalDataSize": 1000,
            },
        },
    }
)
@pytest.mark.asyncio
async def test_max_total_data_size(
    bidi_session,
    url,
    inline,
    setup_network_test,
    top_context,
    wait_for_event,
    wait_for_future_safe,
    add_data_collector,
    fetch,
):
    await setup_network_test(
        events=[
            RESPONSE_COMPLETED_EVENT,
        ]
    )

    await bidi_session.browsing_context.navigate(
        context=top_context["context"],
        url=PAGE_EMPTY_HTML,
        wait="complete",
    )

    # Add a collector, with the same max size as the total size.
    await add_data_collector(
        collector_type="blob", data_types=["response"], max_encoded_data_size=1000
    )

    # Build a url with a response size slightly below the maximum.
    big_response = "".join("A" for i in range(900))
    big_url = inline(big_response, doctype="js")

    # Build a url with a small response size.
    small_response = "".join("A" for i in range(10))
    small_url = inline(small_response, doctype="js")

    # Build a url with a response size slightly over the maximum.
    too_big_response = "".join("A" for i in range(1100))
    too_big_url = inline(too_big_response, doctype="js")

    # Note: We use the "js" doctype here to avoid any boilerplate in the inline
    # response, which would inflate the sizes unexpectedly.

    async def send_request(url):
        on_response_completed = wait_for_event(RESPONSE_COMPLETED_EVENT)
        await fetch(url, method="GET")
        event = await wait_for_future_safe(on_response_completed)
        return event["request"]["request"]

    # Send a request to store the 900 chars (uncompressed) response.
    request_1_big = await send_request(big_url)

    await assert_request_data_available(request_1_big, bidi_session)

    # Send another big request.
    # Check a previous request is evicted if more space is needed.
    request_2_big = await send_request(big_url)

    # Expected: 1->evicted, 2->OK
    await assert_request_data_unavailable(request_1_big, bidi_session)
    await assert_request_data_available(request_2_big, bidi_session)

    # Send a small request for a 10 chars response.
    # Check eviction only done if more space is required.
    request_3_small = await send_request(small_url)

    # Expected: 2->OK, 3->OK
    await assert_request_data_available(request_2_big, bidi_session)
    await assert_request_data_available(request_3_small, bidi_session)

    # Send another big request.
    # Check eviction only removes requests as needed (preserves small request if
    # enough space is available).
    request_4_big = await send_request(big_url)

    # Expected: 2->evicted, 3->OK, 4->OK
    await assert_request_data_unavailable(request_2_big, bidi_session)
    await assert_request_data_available(request_3_small, bidi_session)
    await assert_request_data_available(request_4_big, bidi_session)

    # Send another small request.
    # This is a preparatory step for the next check.
    request_5_small = await send_request(small_url)

    # Expected: 3->OK, 4->OK, 5->OK
    await assert_request_data_available(request_3_small, bidi_session)
    await assert_request_data_available(request_4_big, bidi_session)
    await assert_request_data_available(request_5_small, bidi_session)

    # Send another big request.
    # Check eviction follows first-in, first-out, the 3rd small request will be
    # evicted because it arrived before the 4th big request (which is
    # mandatory to delete to store the new one).
    # But the 5th small request should still be available.
    request_6_big = await send_request(big_url)

    # Expected: 3->evicted, 4->evicted, 5->OK, 6->OK
    await assert_request_data_unavailable(request_3_small, bidi_session)
    await assert_request_data_unavailable(request_4_big, bidi_session)
    await assert_request_data_available(request_5_small, bidi_session)
    await assert_request_data_available(request_6_big, bidi_session)

    # Send a request which is too big for the collector.
    # No other request should be evicted in this case, 5th and 6th requests
    # should still be available.
    request_7_too_big = await send_request(too_big_url)

    # Expected: 5->OK, 6->OK, 7->no such data
    await assert_request_data_available(request_5_small, bidi_session)
    await assert_request_data_available(request_6_big, bidi_session)
    # Request 7 was not stored at all, and a different error is emitted in this
    # case.
    with pytest.raises(error.NoSuchNetworkDataException):
        await bidi_session.network.get_data(
            request=request_7_too_big,
            data_type="response",
        )

    # Send a request which is too big by just one byte.
    too_big_one_byte_response = "".join("A" for i in range(1001))
    too_big_one_byte_url = inline(too_big_one_byte_response, doctype="js")
    request_8_too_big_one_byte = await send_request(too_big_one_byte_url)

    # Expected: 5->OK, 6->OK, 8->no such data
    await assert_request_data_available(request_5_small, bidi_session)
    await assert_request_data_available(request_6_big, bidi_session)
    # Request 8 was not stored at all, and a different error is emitted in this
    # case.
    with pytest.raises(error.NoSuchNetworkDataException):
        await bidi_session.network.get_data(
            request=request_8_too_big_one_byte,
            data_type="response",
        )

    # Send a request which is exactly the max size.
    max_size_response = "".join("A" for i in range(1000))
    max_size_url = inline(max_size_response, doctype="js")
    request_9_max_size = await send_request(max_size_url)

    # Expected: 5->evicted, 6->evicted, 9->OK
    await assert_request_data_unavailable(request_5_small, bidi_session)
    await assert_request_data_unavailable(request_6_big, bidi_session)
    await assert_request_data_available(request_9_max_size, bidi_session)

    # Send two requests which add up to the max size.
    half_size_response = "".join("A" for i in range(500))
    half_size_url = inline(half_size_response, doctype="js")
    request_10_half_size = await send_request(half_size_url)
    request_11_half_size = await send_request(half_size_url)

    # Expected: 9->evicted, 10->OK, 11->OK
    await assert_request_data_unavailable(request_9_max_size, bidi_session)
    await assert_request_data_available(request_10_half_size, bidi_session)
    await assert_request_data_available(request_11_half_size, bidi_session)


async def assert_request_data_available(request, bidi_session):
    data = await bidi_session.network.get_data(
        request=request,
        data_type="response",
    )
    assert isinstance(data["value"], str)


async def assert_request_data_unavailable(request, bidi_session):
    with pytest.raises(error.UnavailableNetworkDataException):
        await bidi_session.network.get_data(
            request=request,
            data_type="response",
        )
