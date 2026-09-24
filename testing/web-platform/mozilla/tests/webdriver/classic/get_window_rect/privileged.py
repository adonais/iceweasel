from tests.support.classic.asserts import assert_success


def get_window_rect(session):
    return session.transport.send("GET", f"session/{session.session_id}/window/rect")


# Window manipulation doesn't interact with the page content and therefore has
# to keep working for privileged pages even without system access.


def test_parent_process_context_without_system_access(parent_process_session):
    response = get_window_rect(parent_process_session)
    assert_success(response)


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = get_window_rect(session)
    assert_success(response)
