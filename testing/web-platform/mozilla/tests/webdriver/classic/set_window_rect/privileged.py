from tests.support.classic.asserts import assert_success


def set_window_rect(session, rect):
    return session.transport.send(
        "POST", f"session/{session.session_id}/window/rect", rect
    )


# Window manipulation doesn't interact with the page content.


def test_parent_process_context_without_system_access(parent_process_session):
    response = set_window_rect(parent_process_session, {"width": 600, "height": 400})
    assert_success(response)


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = set_window_rect(session, {"width": 600, "height": 400})
    assert_success(response)
