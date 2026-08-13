import pytest

URL = "https://catalog.archives.gov/id/80660381"

HERO_CSS = "#preview #contents-panel img[src*='_155.jpg']"


async def are_thumbnails_in_correct_order(client):
    await client.navigate(URL)
    client.await_css(HERO_CSS, is_displayed=True)
    return client.execute_script("""
        const thumbs = [...document.querySelectorAll("#preview #contents-panel img")].map(i => i.src.match("_\\\\d*?.jpg"));
        return thumbs[0] == "_001.jpg";
    """)


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await are_thumbnails_in_correct_order(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await are_thumbnails_in_correct_order(client)
