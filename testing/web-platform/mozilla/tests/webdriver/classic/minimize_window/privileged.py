from tests.support.classic.asserts import assert_success


def minimize_window(session):
    return session.transport.send(
        "POST", f"session/{session.session_id}/window/minimize"
    )


# Window manipulation doesn't interact with the page content.


def test_parent_process_context_without_system_access(parent_process_session):
    response = minimize_window(parent_process_session)
    assert_success(response)


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = minimize_window(session)
    assert_success(response)
