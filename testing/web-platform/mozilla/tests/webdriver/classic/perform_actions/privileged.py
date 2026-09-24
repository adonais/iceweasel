import pytest
from tests.classic.perform_actions import perform_actions
from tests.support.classic.asserts import assert_error, assert_success

MOUSE_ACTIONS = [
    {
        "type": "pointer",
        "id": "mouse1",
        "parameters": {"pointerType": "mouse"},
        "actions": [{"type": "pointerMove", "x": 10, "y": 10}],
    }
]

TOUCH_ACTIONS = [
    {
        "type": "pointer",
        "id": "touch1",
        "parameters": {"pointerType": "touch"},
        "actions": [{"type": "pointerMove", "x": 10, "y": 10}],
    }
]

WHEEL_ACTIONS = [
    {
        "type": "wheel",
        "id": "wheel1",
        "actions": [{"type": "scroll", "x": 0, "y": 0, "deltaX": 5, "deltaY": 10}],
    }
]


@pytest.fixture(autouse=True)
def release_actions():
    """Override the fixture of the same name from the upstream "perform_actions"
    conftest. It always uses the "session" fixture, which is not used by all the
    tests below, and releasing actions is refused for a privileged page."""
    yield


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.
#
# Only the first test below is parametrized by input source, because it dispatches
# real events. The rejection tests all fail in "ActionsHelper.assertInViewPort",
# which every input source reaches, so a single source is enough there.


@pytest.mark.parametrize(
    "actions",
    [MOUSE_ACTIONS, TOUCH_ACTIONS, WHEEL_ACTIONS],
    ids=["mouse", "touch", "wheel"],
)
@pytest.mark.geckodriver(allow_system_access=True)
def test_parent_process_context_with_system_access(session, actions):
    session.url = "about:about"

    response = perform_actions(session, actions)
    assert_success(response)

    session.actions.release()


def test_parent_process_context_without_system_access(parent_process_session):
    response = perform_actions(parent_process_session, MOUSE_ACTIONS)
    assert_error(response, "unsupported operation")


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = perform_actions(session, MOUSE_ACTIONS)
    assert_error(response, "unsupported operation")
