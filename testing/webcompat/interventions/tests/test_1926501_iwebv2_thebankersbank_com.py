from asyncio.exceptions import TimeoutError

import pytest

URL = "https://iwebv2.thebankersbank.com/Authentication/Login"
UNSUPPORTED_TEXT = "switch to a supported browser"


async def visit_site(client):
    try:
        await client.navigate(URL, timeout=30, no_skip=True)
    except TimeoutError:
        pytest.skip("Region-locked, cannot test. Try using a VPN set to USA.")
        return False
    return True


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    if await visit_site(client):
        assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    if await visit_site(client):
        assert client.find_text(UNSUPPORTED_TEXT, is_displayed=True)
