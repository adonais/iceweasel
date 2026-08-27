import pytest

URL = "https://youthrockband.setmore.com/"
BROKEN_TEXT = "something went wrong"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL)
    assert not client.find_text(BROKEN_TEXT, is_displayed=True)
