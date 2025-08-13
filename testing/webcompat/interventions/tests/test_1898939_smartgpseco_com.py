import pytest
from webdriver.error import NoSuchElementException

URL = "https://www.smartgpseco.com/#sign/sign_in"

UNSUPPORTED_TEXT = "only supports Google Chrome"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    try:
        client.await_text(UNSUPPORTED_TEXT, is_displayed=True, timeout=5)
        assert False
    except NoSuchElementException:
        assert True


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
