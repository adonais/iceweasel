import pytest
from webdriver import NoSuchElementException

URL = "https://copyleaks.com/ai-content-detector"
IFRAME_CSS = "#ai-content-detector"
UNSUPPORTED_CSS = "#outdated"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL)
    client.switch_to_frame(client.await_css(IFRAME_CSS))
    try:
        client.await_css(
            UNSUPPORTED_CSS, condition="!!elem.innerText", is_displayed=True, timeout=3
        )
        assert False
    except NoSuchElementException:
        assert True
