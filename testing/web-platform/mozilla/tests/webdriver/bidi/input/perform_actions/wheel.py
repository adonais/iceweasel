import pytest
from tests.bidi.input.perform_actions import assert_scroll_position
from webdriver.bidi.modules.input import Actions, get_element_origin
from webdriver.bidi.modules.script import ContextTarget

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize("device_pixel_ratio", ["1.0", "2.0", "0.5"])
async def test_scroll_delta_device_pixel(
    bidi_session,
    new_tab,
    test_actions_wheel_page,
    get_element,
    use_pref,
    device_pixel_ratio,
):
    await use_pref("layout.css.devPixelsPerPx", device_pixel_ratio)

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"],
        url=test_actions_wheel_page(),
        wait="complete",
    )

    result = await bidi_session.script.evaluate(
        expression="window.devicePixelRatio",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert result["value"] == float(device_pixel_ratio)

    target = await get_element("#scrollable", context=new_tab)

    actions = Actions()
    actions.add_wheel().scroll(
        x=0,
        y=0,
        delta_x=50,
        delta_y=70,
        origin=get_element_origin(target),
    )

    await bidi_session.input.perform_actions(
        actions=actions, context=new_tab["context"]
    )

    await assert_scroll_position(bidi_session, new_tab, target, 50, 70)
