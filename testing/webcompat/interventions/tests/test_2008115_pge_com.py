import pytest

URL = "https://www.pge.com/"
UNSUPPORTED_TEXT = "use a browser listed at"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL)
    await client.stall(4)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)
