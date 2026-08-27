import pytest

URL = "https://13coins.toast.site/menu/13coins"
SECOND_ITEM_CSS = ".itemSection.columns.expanded .item + .item"


async def is_second_item_visible(client):
    await client.navigate(URL)
    return client.execute_script(
        """
        const item = arguments[0];
        const container = item.closest(".itemSection");
        return item.getBoundingClientRect().bottom < container.getBoundingClientRect().bottom;
    """,
        client.await_css(SECOND_ITEM_CSS, is_displayed=True),
    )


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await is_second_item_visible(client)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await is_second_item_visible(client)


# note that smaller screens will get a different responsive breakpoint
# which does not have the issue, but tablets may still see it.
@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_smaller_responsive_breakpoint_is_fine(client):
    assert await is_second_item_visible(client)
