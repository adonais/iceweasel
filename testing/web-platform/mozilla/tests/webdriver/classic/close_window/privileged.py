from tests.support.classic.asserts import assert_success


def close_window(session):
    return session.transport.send("DELETE", f"session/{session.session_id}/window")


# Closing a tab doesn't interact with the page content.


def test_parent_process_context_without_system_access(parent_process_session):
    # Keep a second tab around so that closing the current one doesn't end
    # the session.
    parent_process_session.new_window(type_hint="tab")

    response = close_window(parent_process_session)
    assert_success(response)
