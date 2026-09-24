import pytest
from tests.support.classic.asserts import assert_error, assert_success


def delete_cookie(session, name):
    return session.transport.send(
        "DELETE", f"session/{session.session_id}/cookie/{name}"
    )


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
def test_parent_process_context_with_system_access(session):
    session.url = "about:about"

    response = delete_cookie(session, "foo")
    assert_success(response)


def test_parent_process_context_without_system_access(parent_process_session):
    response = delete_cookie(parent_process_session, "foo")
    assert_error(response, "unsupported operation")


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = delete_cookie(session, "foo")
    assert_error(response, "unsupported operation")
