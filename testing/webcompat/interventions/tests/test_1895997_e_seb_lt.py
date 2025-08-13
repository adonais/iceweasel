import pytest
from webdriver import NoSuchElementException

URL = "https://e.seb.lt/ib/login"

UNSUPPORTED_CSS = ".alert"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    try:
        client.await_css(
            UNSUPPORTED_CSS,
            condition="elem.innerText.includes('Chrome')",
            is_displayed=True,
            timeout=3,
        )
        assert False
    except NoSuchElementException:
        assert True


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    assert client.await_css(
        UNSUPPORTED_CSS,
        condition="elem.innerText.includes('Chrome')",
        is_displayed=True,
    )
