import pytest

URL = "https://bahn.de/info/login"

LOADING_CSS = "#loading-container"


async def is_page_blank(client):
    await client.navigate(URL, wait="none")
    client.await_css(LOADING_CSS, is_displayed=True)
    client.await_element_hidden(client.css(LOADING_CSS))
    await client.stall(3)
    return client.execute_script("return !document.body.innerText")


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    assert not await is_page_blank(client)
