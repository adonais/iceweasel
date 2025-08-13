import asyncio

import pytest

URL = "https://autostar-novoross.ru/"
IFRAME_CSS = "iframe[src*='google.com/maps']"
RENEW_TEXT = "402 Please renew your subscription"


async def map_is_correct_height(client):
    # This site often just gives a useless page with the RENEW_TEXT.
    # That seems to happen more often with webdriver on.
    await client.make_preload_script("delete navigator.__proto__.webdriver")

    # We try reloading a few times to see if we are able to get past that message.
    for _ in range(10):
        await client.navigate(URL)
        iframe, renew = client.await_first_element_of(
            [
                client.css(IFRAME_CSS),
                client.text(RENEW_TEXT),
            ],
            is_displayed=True,
        )

        if iframe:
            break

        await asyncio.sleep(1)

    if not iframe:
        pytest.xfail(
            "Site is repeatedly giving a '402 please renew your subscription' message. Try testing manually."
        )
        return

    return client.execute_script(
        """
       const iframe = arguments[0];
       return iframe.clientHeight == iframe.parentNode.clientHeight;
    """,
        iframe,
    )


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await map_is_correct_height(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await map_is_correct_height(client)
