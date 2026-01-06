import pytest

URL = "https://www.goodyearfiaetrc.com/standings"

DEAD_TEXT = "Page not found"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_if_site_returns(client):
    await client.navigate(URL, wait="none")
    assert client.await_text(DEAD_TEXT, is_displayed=True)
