import pytest
from tests.classic.perform_actions import assert_scroll_position


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize("device_pixel_ratio", ["1.0", "2.0", "0.5"])
def test_scroll_delta_device_pixel(
    session,
    new_tab_classic,
    test_actions_wheel_page,
    wheel_chain,
    use_pref,
    device_pixel_ratio,
):
    use_pref("layout.css.devPixelsPerPx", device_pixel_ratio)

    session.url = test_actions_wheel_page()

    assert session.execute_script("return window.devicePixelRatio") == float(
        device_pixel_ratio
    )

    target = session.find.css("#scrollable", all=False)
    wheel_chain.scroll(0, 0, 50, 70, origin=target).perform()

    assert_scroll_position(session, target, 50, 70)
