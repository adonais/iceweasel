import pytest

URL = "https://iqconnect.house.gov/iqextranet/EForm.aspx?__cid=PA07RM&__fid=100156&fbclid=IwY2xjawSJf1tleHRuA2FlbQIxMABicmlkETFXTnozM0w2QlBPbWN6UGFac3J0YwZhcHBfaWQQMjIyMDM5MTc4ODIwMDg5MgABHiZoI5dhzyOjGncMly6JF5v042ym-z_3ku1wtChpRrR0-UIJB_dODj-5qbZ0_aem_YWdncwBWJqFwUEEZmsYSWntrzR4g&brid=YWdncwG0SsX82RzJxkLWCZ8EgSt6"

SUBMIT_CSS = "#btn_submit"
SUCCESS_CSS = "[role=alert]"


@pytest.mark.actual_platform_required
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    client.click(client.await_css(SUBMIT_CSS, is_displayed=True))
    client.await_css(SUCCESS_CSS, is_displayed=True, timeout=3)


@pytest.mark.actual_platform_required
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    btn = client.await_css(SUBMIT_CSS, is_displayed=True)
    client.scroll_into_view(btn)
    client.execute_script(
        """
      arguments[0].addEventListener("focus", () => window.__focused = true);
    """,
        btn,
    )
    btn.click()
    assert client.execute_script("return window.__focused")
