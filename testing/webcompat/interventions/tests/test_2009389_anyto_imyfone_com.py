import pytest

URL = "https://anyto.imyfone.com/pokemon-go/how-to-hatch-eggs-in-pokemon-go-without-walking/"

TOC_CSS = "section.article-wraper > .catalog-box"


async def does_toc_cover_screen(client):
    await client.navigate(URL)
    await client.stall(2)
    return client.execute_script(
        """
            return arguments[0].getBoundingClientRect().top < 0;
        """,
        client.await_css(TOC_CSS, is_displayed=True),
    )


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await does_toc_cover_screen(client)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await does_toc_cover_screen(client)
