import pytest

URL = "https://dvcreservations.com/rarefinds.php"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await client.test_nicescroll_breaks_scrolling(URL)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await client.test_nicescroll_breaks_scrolling(URL)
