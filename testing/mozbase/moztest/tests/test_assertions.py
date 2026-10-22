import mozunit
import pytest
from moztest.assertions import AssertionFailureParser


class FakeLogger:
    def __init__(self):
        self.failures = []

    def assertion_failure(self, **data):
        self.failures.append(data)


MOZ_ASSERT = """\
[6136] Assertion failure: false (MOZ_ASSERT_UNREACHABLE: WorkerGlobalScope alive after worker shutdown), at /builds/worker/checkouts/gecko/dom/workers/RuntimeService.cpp:2229
#01: mozilla::dom::workerinternals::(anonymous namespace)::WorkerThreadPrimaryRunnable::Run() [dom/workers/RuntimeService.cpp:2229]
#02: nsThread::ProcessNextEvent(bool, bool*) [xpcom/threads/nsThread.cpp:1154]
#03: ??? [libxul.so + 0x43a0]
[Parent 2672, Main Thread] WARNING: '!sTextInputHandlingWidget', file /builds/worker/checkouts/gecko/dom/events/IMEStateManager.cpp:1238
"""

NS_ASSERTION = """\
[Parent 5900, Main Thread] ###!!! ASSERTION: Out-of-flow frame got reflowed before its placeholder: 'Error', file layout/generic/nsPlaceholderFrame.cpp:131
#01: NS_DebugBreak(unsigned int, char const*, char const*, char const*, int) [xpcom/base/nsDebugImpl.cpp:516]
#02: nsPlaceholderFrame::Reflow(nsPresContext*, mozilla::ReflowOutput&, mozilla::ReflowInput const&, nsReflowStatus&) [layout/generic/nsPlaceholderFrame.cpp:131]
TEST-PASS | layout/base/tests/test_foo.html | ok
"""

# xpcshell runs with XPCOM_DEBUG_BREAK=stack-and-abort: the assertion is
# followed by a MOZ_CRASH carrying the same message, and a second stack.
XPCSHELL_ABORT = """\
[13140, Unnamed thread 1f94df9a100] ###!!! ASSERTION: Failed NS_DispatchToMainThread() in shutdown; leaking: 'aDispatchFlags & NS_DISPATCH_FALLIBLE', file /builds/worker/checkouts/gecko/xpcom/threads/nsThreadUtils.cpp:229
#01: NS_DebugBreak(unsigned int, char const*, char const*, char const*, int) [xpcom/base/nsDebugImpl.cpp:516]
#02: NS_DispatchToMainThread(already_AddRefed<nsIRunnable>&&, nsIEventTarget::DispatchFlags) [xpcom/threads/nsThreadUtils.cpp:228]
[13140] Hit MOZ_CRASH([13140, Unnamed thread 1f94df9a100] ###!!! ASSERTION: Failed NS_DispatchToMainThread() in shutdown; leaking: 'aDispatchFlags & NS_DISPATCH_FALLIBLE', file /builds/worker/checkouts/gecko/xpcom/threads/nsThreadUtils.cpp:229) at /builds/worker/checkouts/gecko/xpcom/base/nsDebugImpl.cpp:528
#01: NS_DebugBreak(unsigned int, char const*, char const*, char const*, int) [xpcom/base/nsDebugImpl.cpp:528]
#02: NS_DispatchToMainThread(already_AddRefed<nsIRunnable>&&, nsIEventTarget::DispatchFlags) [xpcom/threads/nsThreadUtils.cpp:228]
"""


def feed(parser, text, pid="A", test=None, time=None):
    return [
        parser.log(line, pid=pid, test=test, time=time) for line in text.splitlines()
    ]


def parse(text, **kwargs):
    logger = FakeLogger()
    parser = AssertionFailureParser(logger)
    consumed = feed(parser, text, **kwargs)
    parser.flush()
    return logger.failures, consumed


def test_moz_assert_with_breakpad_frames():
    failures, consumed = parse(MOZ_ASSERT, test="dom/workers/test/test_bar.html")

    assert len(failures) == 1
    failure = failures[0]
    assert failure["kind"] == "MOZ_ASSERT"
    assert failure["fatal"] is True
    assert failure["pid"] == 6136
    assert failure["process_type"] is None
    assert failure["thread"] is None
    assert failure["message"] == (
        "false (MOZ_ASSERT_UNREACHABLE: WorkerGlobalScope alive after worker shutdown)"
    )
    assert (
        failure["file"]
        == "/builds/worker/checkouts/gecko/dom/workers/RuntimeService.cpp"
    )
    assert failure["lineno"] == 2229
    assert failure["test"] == "dom/workers/test/test_bar.html"
    assert "time" not in failure
    assert failure["stack"] == [
        {
            "function": "mozilla::dom::workerinternals::(anonymous namespace)::WorkerThreadPrimaryRunnable::Run()",
            "file": "dom/workers/RuntimeService.cpp",
            "line": 2229,
        },
        {
            "function": "nsThread::ProcessNextEvent(bool, bool*)",
            "file": "xpcom/threads/nsThread.cpp",
            "line": 1154,
        },
        {"module": "libxul.so", "module_offset": 0x43A0},
    ]
    # The header and the frames are consumed, the trailing warning is not.
    assert consumed == [True, True, True, True, False]


def test_time_is_forwarded():
    failures, _ = parse(MOZ_ASSERT, time=1234)
    assert failures[0]["time"] == 1234


def test_moz_crash_reasons():
    failures, _ = parse(
        "[12] Hit MOZ_CRASH() at /src/a.cpp:1\n"
        "[12] Hit MOZ_CRASH(ElementAt(aIndex = 3, aLength = 2)) at c:\\src\\b.cpp:2\n"
    )
    assert [f["kind"] for f in failures] == ["MOZ_CRASH", "MOZ_CRASH"]
    assert failures[0]["message"] == ""
    assert failures[0]["file"] == "/src/a.cpp"
    assert failures[0]["stack"] is None
    assert failures[1]["message"] == "ElementAt(aIndex = 3, aLength = 2)"
    assert failures[1]["file"] == "c:\\src\\b.cpp"
    assert failures[1]["lineno"] == 2
    assert failures[1]["fatal"] is True


def test_ns_assertion_is_not_fatal():
    failures, consumed = parse(NS_ASSERTION)

    assert len(failures) == 1
    failure = failures[0]
    assert failure["kind"] == "NS_ASSERTION"
    assert failure["fatal"] is False
    assert failure["pid"] == 5900
    assert failure["process_type"] == "Parent"
    assert failure["thread"] == "Main Thread"
    assert failure["message"] == (
        "Out-of-flow frame got reflowed before its placeholder: 'Error'"
    )
    assert failure["file"] == "layout/generic/nsPlaceholderFrame.cpp"
    assert failure["lineno"] == 131
    assert [f["function"] for f in failure["stack"]] == [
        "NS_DebugBreak(unsigned int, char const*, char const*, char const*, int)",
        "nsPlaceholderFrame::Reflow(nsPresContext*, mozilla::ReflowOutput&, mozilla::ReflowInput const&, nsReflowStatus&)",
    ]
    assert consumed[-1] is False


@pytest.mark.parametrize(
    "rest,message,file_,lineno",
    (
        ("msg: 'expr', file a/b.cpp:12", "msg: 'expr'", "a/b.cpp", 12),
        ("msg: file a/b.cpp:12", "msg", "a/b.cpp", 12),
        ("'expr', file a/b.cpp:12", "'expr'", "a/b.cpp", 12),
        ("file a/b.cpp:12", "", "a/b.cpp", 12),
        ("msg: 'expr', file a/b.cpp, line 12", "msg: 'expr'", "a/b.cpp", 12),
        ("msg: 'expr', ", "msg: 'expr'", None, None),
    ),
)
def test_ns_assertion_message_shapes(rest, message, file_, lineno):
    failures, _ = parse(f"[Child 7, Main Thread] ###!!! ASSERTION: {rest}\n")
    assert len(failures) == 1
    assert failures[0]["message"] == message
    assert failures[0]["file"] == file_
    assert failures[0]["lineno"] == lineno
    assert failures[0]["process_type"] == "Child"


@pytest.mark.parametrize(
    "process_type",
    (
        "Parent",
        "PKCS11ModuleChild",
        "Utility AudioDecoder",
        "MF Media Engine CDM",
    ),
)
def test_ns_assertion_process_type_shapes(process_type):
    failures, _ = parse(
        f"[{process_type} 42, Main Thread] ###!!! ASSERTION: msg: 'expr', file a/b.cpp:12\n"
    )
    assert len(failures) == 1
    assert failures[0]["process_type"] == process_type
    assert failures[0]["pid"] == 42
    assert failures[0]["thread"] == "Main Thread"
    assert failures[0]["message"] == "msg: 'expr'"


@pytest.mark.parametrize("bell", ("\x07", "\\x07"), ids=("raw", "escaped"))
def test_bell_prefix_is_ignored(bell):
    failures, consumed = parse(
        f"{bell}[Child 7, Main Thread] ###!!! ASSERTION: msg: 'expr', file a/b.cpp:12\n"
        "#01: NS_DebugBreak [xpcom/base/nsDebugImpl.cpp:508]\n"
    )
    assert consumed == [True, True]
    assert failures[0]["kind"] == "NS_ASSERTION"
    assert failures[0]["pid"] == 7
    assert failures[0]["stack"][0]["function"] == "NS_DebugBreak"


def test_ns_abort():
    failures, _ = parse(
        "[Parent 7, Main Thread] ###!!! ABORT: boom: 'Error', file a/b.cpp:3\n"
    )
    assert failures[0]["kind"] == "NS_ABORT"
    assert failures[0]["fatal"] is True


def test_xpcshell_abort_folds_into_the_assertion():
    failures, consumed = parse(XPCSHELL_ABORT)

    assert len(failures) == 1
    failure = failures[0]
    assert failure["kind"] == "NS_ASSERTION"
    assert failure["fatal"] is True
    assert failure["pid"] == 13140
    assert failure["process_type"] is None
    assert failure["thread"] == "Unnamed thread 1f94df9a100"
    assert failure["lineno"] == 229
    # Only the assertion's own stack is kept; the crash's stack is swallowed.
    assert [f["line"] for f in failure["stack"]] == [516, 228]
    assert all(consumed)


def test_moz_crash_with_another_message_is_separate():
    failures, _ = parse(
        "[7, Main Thread] ###!!! ASSERTION: one: 'a', file x.cpp:1\n"
        "#01: f [x.cpp:1]\n"
        "[7] Hit MOZ_CRASH([7, Main Thread] ###!!! ASSERTION: two: 'b', file y.cpp:2) at d.cpp:3\n"
        "#01: g [y.cpp:2]\n"
    )
    assert [f["kind"] for f in failures] == ["NS_ASSERTION", "MOZ_CRASH"]
    assert failures[0]["fatal"] is False
    assert failures[1]["message"].endswith("file y.cpp:2")


@pytest.mark.parametrize(
    "line,frame",
    (
        (
            "#01: mozilla::Foo::Bar() (/home/me/src/dom/foo.cpp:12)",
            {
                "function": "mozilla::Foo::Bar()",
                "file": "/home/me/src/dom/foo.cpp",
                "line": 12,
            },
        ),
        (
            "#02: nsTArray<int>::operator[](unsigned long) [xpcom/ds/nsTArray.h:1000]",
            {
                "function": "nsTArray<int>::operator[](unsigned long)",
                "file": "xpcom/ds/nsTArray.h",
                "line": 1000,
            },
        ),
        (
            "#03: main [c:\\src\\browser\\app\\nsBrowserApp.cpp:30]",
            {
                "function": "main",
                "file": "c:\\src\\browser\\app\\nsBrowserApp.cpp",
                "line": 30,
            },
        ),
        (
            "#04: mozilla::Foo::Bar() (libxul.so + 0x1234)",
            {
                "function": "mozilla::Foo::Bar()",
                "module": "libxul.so",
                "module_offset": 0x1234,
            },
        ),
        (
            "#05: ???[libxul.so +0x43a0]",
            {"module": "libxul.so", "module_offset": 0x43A0},
        ),
        ("#06: ??? (???:???)", {"function": "???"}),
        (
            "#07: core::ops::function::Fn::call::h1234567890abcdef [library/core/src/ops/function.rs:79]",
            {
                "function": "core::ops::function::Fn::call",
                "file": "library/core/src/ops/function.rs",
                "line": 79,
            },
        ),
    ),
)
def test_frame_formats(line, frame):
    failures, _ = parse(f"[1] Assertion failure: x, at a.cpp:1\n{line}\n")
    assert failures[0]["stack"] == [frame]


def test_interleaved_lines_are_tolerated():
    logger = FakeLogger()
    parser = AssertionFailureParser(logger)
    consumed = feed(
        parser,
        "[1] Assertion failure: x, at a.cpp:1\n"
        "[Child 2, Main Thread] WARNING: noise, file b.cpp:2\n"
        "#01: f [a.cpp:1]\n"
        "some other output\n"
        "another line\n"
        "#02: g [c.cpp:3]\n",
    )
    parser.flush()

    assert consumed == [True, False, True, False, False, True]
    assert [f["function"] for f in logger.failures[0]["stack"]] == ["f", "g"]


def test_too_much_noise_ends_the_report():
    logger = FakeLogger()
    parser = AssertionFailureParser(logger)
    feed(parser, "[1] Assertion failure: x, at a.cpp:1\n#01: f [a.cpp:1]\n")
    for _ in range(4):
        parser.log("noise", pid="A")
    assert len(logger.failures) == 1
    # A frame arriving after the report was closed is ignored.
    assert parser.log("#02: g [c.cpp:3]", pid="A") is False
    parser.flush()
    assert len(logger.failures) == 1
    assert [f["function"] for f in logger.failures[0]["stack"]] == ["f"]


def test_new_header_ends_the_previous_report():
    failures, _ = parse(
        "[1] Assertion failure: x, at a.cpp:1\n"
        "#01: f [a.cpp:1]\n"
        "[1] Assertion failure: y, at b.cpp:2\n"
        "#01: g [b.cpp:2]\n"
    )
    assert [(f["message"], f["stack"][0]["function"]) for f in failures] == [
        ("x", "f"),
        ("y", "g"),
    ]


def test_interleaved_streams():
    logger = FakeLogger()
    parser = AssertionFailureParser(logger)
    a = MOZ_ASSERT.splitlines()
    b = NS_ASSERTION.splitlines()
    for i in range(max(len(a), len(b))):
        if i < len(a):
            parser.log(a[i], pid="A")
        if i < len(b):
            parser.log(b[i], pid="B")
    parser.flush()

    assert {f["kind"]: len(f["stack"]) for f in logger.failures} == {
        "MOZ_ASSERT": 3,
        "NS_ASSERTION": 2,
    }


def test_flush_emits_pending_report():
    logger = FakeLogger()
    parser = AssertionFailureParser(logger)
    feed(parser, "[1] Assertion failure: x, at a.cpp:1\n#01: f [a.cpp:1]\n")
    assert logger.failures == []
    parser.flush()
    assert len(logger.failures) == 1
    parser.flush()
    assert len(logger.failures) == 1


def test_discard_pending_report():
    logger = FakeLogger()
    parser = AssertionFailureParser(logger)
    feed(parser, "[1] Assertion failure: x, at a.cpp:1\n#01: f [a.cpp:1]\n")

    assert parser.discard(("y", "a.cpp", 1)) is False
    assert parser.discard(("x", "a.cpp", 1)) is True
    parser.flush()
    assert logger.failures == []


def test_unrelated_output_is_ignored():
    failures, consumed = parse(
        "just some output\n#01: not in a report [a.cpp:1]\nAssertion failure\n\n"
    )
    assert failures == []
    assert consumed == [False, False, False, False]


if __name__ == "__main__":
    mozunit.main()
