import pytest

URL = "http://tsu-results.rf.gd/tsu_results/f3_championship/season_3/F3%20Championship%20-%20season%203.html?i=1"

TABLE_HEADER_CSS = ".w3-table-container table.sortable thead th:first-of-type"
TABLE_CELL_CSS = ".w3-table-container table.sortable tbody td:first-of-type"


async def check_header_is_positioned_correctly(client):
    await client.navigate(URL, wait="none")
    header = client.await_css(TABLE_HEADER_CSS, is_displayed=True)
    cell = client.await_css(TABLE_CELL_CSS, is_displayed=True)
    # the boxes of the leftmost header and cells will perfectly align if the layout is "broken",
    # since the header is rotated, and likewise its width will be wider than the normal cell width.
    return client.execute_script(
        """
        const [header, cell] = arguments;
        const headerBB = header.getBoundingClientRect();
        const cellBB  = cell.getBoundingClientRect();
        return headerBB.left != cellBB.left && headerBB.width > cellBB.width;
      """,
        header,
        cell,
    )


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await check_header_is_positioned_correctly(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await check_header_is_positioned_correctly(client)
