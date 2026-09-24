import pytest
from tests.support.classic.asserts import assert_error, assert_success


def switch_to_frame(session, frame):
    return session.transport.send(
        "POST", f"session/{session.session_id}/frame", {"id": frame}
    )


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
def test_parent_process_context_with_system_access(session):
    session.url = "about:about"

    response = switch_to_frame(session, None)
    assert_success(response)


def test_parent_process_context_without_system_access(parent_process_session):
    response = switch_to_frame(parent_process_session, None)
    assert_error(response, "unsupported operation")


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = switch_to_frame(session, None)
    assert_error(response, "unsupported operation")
