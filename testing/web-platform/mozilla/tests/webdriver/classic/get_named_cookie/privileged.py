import pytest
from tests.support.classic.asserts import assert_error


def get_named_cookie(session, name):
    return session.transport.send("GET", f"session/{session.session_id}/cookie/{name}")


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
def test_parent_process_context_with_system_access(session):
    session.url = "about:about"

    response = get_named_cookie(session, "foo")
    assert_error(response, "no such cookie")


def test_parent_process_context_without_system_access(parent_process_session):
    response = get_named_cookie(parent_process_session, "foo")
    assert_error(response, "unsupported operation")


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = get_named_cookie(session, "foo")
    assert_error(response, "unsupported operation")
