import mozunit
from moztest.ubsan import UBSanErrorParser


class FakeLogger:
    def __init__(self):
        self.errors = []

    def ubsan_error(self, **data):
        self.errors.append(data)


GGML = "/builds/worker/checkouts/gecko/third_party/llama.cpp/ggml/src/ggml-c.c"
MESSAGE = "applying non-zero offset 96 to null pointer"

REPORT = f"""\
{GGML}:7106:33: runtime error: {MESSAGE}
    #0 0x7b417858d37c in incr_ptr_aligned {GGML}:7106:33
    #1 0x7b4178779e4f in llama_context::llama_context(llama_model const&, llama_context_params) /builds/worker/checkouts/gecko/third_party/llama.cpp/src/llama-context.cpp:401:9
    #2 0x55b338272d96 in asan_thread_start(void*) /builds/worker/fetches/llvm-project/compiler-rt/lib/asan/asan_interceptors.cpp:246:28
    #3 0x7f42401b0a33 in clone misc/../sysdeps/unix/sysv/linux/x86_64/clone.S:100
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior {GGML}:7106:33
"""

UNSYMBOLIZED = """\
(libxul.so+0x1234): runtime error: load of value 190, which is not a valid value for type 'bool'
    #0 0x7f00 in mozilla::Foo::Bar() (libxul.so+0x1234) (BuildId: abc123)
    #1 0x7f01  (libxul.so+0x5678)
    #2 0x7f02 in std::thread::Builder::spawn::hdeadbeefdeadbeef (libxul.so+0x9abc)
    #3 0x7f03 in _start (<unknown module>)
    #4 0x7f04  (<unknown module>)
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior (libxul.so+0x1234) in mozilla::Foo::Bar()
"""

FUNCTION_CHECK = """\
/src/a.c:12:3: runtime error: call to function foo through pointer to incorrect function type 'void (*)(int)'
/src/b.c:3: note: foo defined here
    #0 0x1 in main /src/a.c:12:3
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior /src/a.c:12:3 in main
"""

VPTR_CHECK = """\
/src/c.cpp:20:5: runtime error: member call on address 0x602000000010 which does not point to an object of type 'Base'
0x602000000010: note: object is of type 'Other'
 00 00 00 00  90 1e 8f 55 a6 7f 00 00  00 00 00 00 00 00 00 00
              ^~~~~~~~~~~~~~~~~~~~~~~
              vptr for 'Other'
    #0 0x2 in main /src/c.cpp:20:5
SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior /src/c.cpp:20:5 in main
"""

KEY = (GGML, 7106, 33, MESSAGE)


def feed(parser, text, pid=None, **kwargs):
    return [parser.log(line, pid=pid, **kwargs) for line in text.splitlines()]


def test_real_report():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    consumed = feed(parser, REPORT, pid="GECKO(1717)", scope="browser/foo", test="t1")

    assert all(consumed)
    assert len(logger.errors) == 1
    report = logger.errors[0]
    assert report["kind"] == "undefined-behavior"
    assert report["message"] == MESSAGE
    assert report["file"] == GGML
    assert report["lineno"] == 7106
    assert report["column"] == 33
    assert report["scope"] == "browser/foo"
    assert report["test"] == "t1"
    assert "time" not in report

    stack = report["stack"]
    assert [f["function"] for f in stack] == [
        "incr_ptr_aligned",
        "llama_context::llama_context(llama_model const&, llama_context_params)",
        "asan_thread_start(void*)",
        "clone",
    ]
    assert stack[0] == {
        "function": "incr_ptr_aligned",
        "file": GGML,
        "line": 7106,
        "column": 33,
    }
    assert stack[2]["file"].endswith("asan_interceptors.cpp")
    assert stack[2]["line"] == 246
    assert stack[2]["column"] == 28
    assert stack[3]["file"] == "misc/../sysdeps/unix/sysv/linux/x86_64/clone.S"
    assert stack[3]["line"] == 100
    assert "column" not in stack[3]


def test_constructor_scope_and_time_are_propagated():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger, scope="xpcshell")
    feed(parser, REPORT, pid=4242, time=1234)

    assert len(logger.errors) == 1
    assert logger.errors[0]["scope"] == "xpcshell"
    assert logger.errors[0]["time"] == 1234


def test_unsymbolized_frames_and_module_header():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    feed(parser, UNSYMBOLIZED)

    assert len(logger.errors) == 1
    report = logger.errors[0]
    assert report["message"] == (
        "load of value 190, which is not a valid value for type 'bool'"
    )
    assert report["file"] is None
    assert report["lineno"] is None
    assert report["column"] is None
    assert report["stack"] == [
        {
            "function": "mozilla::Foo::Bar()",
            "module": "libxul.so",
            "module_offset": 0x1234,
        },
        {"module": "libxul.so", "module_offset": 0x5678},
        {
            "function": "std::thread::Builder::spawn",
            "module": "libxul.so",
            "module_offset": 0x9ABC,
        },
        {"function": "_start"},
        {"function": "<unknown module>"},
    ]


def test_header_without_column():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    parser.log("/src/a.c:12: runtime error: division by zero")
    parser.log("SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior /src/a.c:12")

    assert len(logger.errors) == 1
    assert logger.errors[0]["file"] == "/src/a.c"
    assert logger.errors[0]["lineno"] == 12
    assert logger.errors[0]["column"] is None


def test_note_lines_are_swallowed():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    consumed = feed(parser, FUNCTION_CHECK)

    assert all(consumed)
    assert len(logger.errors) == 1
    report = logger.errors[0]
    assert report["message"].startswith("call to function foo")
    assert report["stack"] == [
        {"function": "main", "file": "/src/a.c", "line": 12, "column": 3}
    ]


def test_hex_dump_is_swallowed_but_unknown_lines_are_not():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    consumed = feed(parser, VPTR_CHECK)

    # Only the "vptr for 'Other'" line is unknown; it does not close the report.
    assert consumed == [True, True, True, True, False, True, True]
    assert len(logger.errors) == 1
    assert len(logger.errors[0]["stack"]) == 1


def test_interleaved_streams():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    a = REPORT.splitlines()
    b = FUNCTION_CHECK.splitlines()
    for line in a[:2]:
        parser.log(line, pid="A")
    for line in b:
        parser.log(line, pid="B")
    for line in a[2:]:
        parser.log(line, pid="A")

    assert len(logger.errors) == 2
    assert logger.errors[0]["message"].startswith("call to function foo")
    assert len(logger.errors[0]["stack"]) == 1
    assert logger.errors[1]["message"] == MESSAGE
    assert len(logger.errors[1]["stack"]) == 4


def test_report_without_frames():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    parser.log(f"{GGML}:7106:33: runtime error: {MESSAGE}")
    parser.log(
        f"SUMMARY: UndefinedBehaviorSanitizer: undefined-behavior {GGML}:7106:33"
    )

    assert len(logger.errors) == 1
    assert logger.errors[0]["stack"] is None


def test_unterminated_report_is_flushed():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    for line in REPORT.splitlines()[:2]:
        parser.log(line)
    assert logger.errors == []

    parser.flush()
    assert len(logger.errors) == 1
    assert len(logger.errors[0]["stack"]) == 1

    parser.flush()
    assert len(logger.errors) == 1


def test_new_header_closes_the_previous_report():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    for line in REPORT.splitlines()[:2]:
        parser.log(line)
    feed(parser, FUNCTION_CHECK)

    assert [e["message"] for e in logger.errors] == [
        MESSAGE,
        "call to function foo through pointer to incorrect function type "
        "'void (*)(int)'",
    ]


def test_kind_from_summary():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    parser.log(f"{GGML}:7106:33: runtime error: {MESSAGE}")
    parser.log(f"SUMMARY: UndefinedBehaviorSanitizer: pointer-overflow {GGML}:7106:33")

    assert logger.errors[0]["kind"] == "pointer-overflow"


def test_discard():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    lines = REPORT.splitlines()
    for line in lines[:3]:
        parser.log(line)

    assert not parser.discard(("/other.c", 1, 1, "nope"))
    assert parser.discard(KEY)
    # The rest of the report is still consumed, but nothing is emitted.
    assert [parser.log(line) for line in lines[3:]] == [True, True, True]
    assert logger.errors == []
    assert not parser.discard(KEY)

    feed(parser, REPORT)
    assert len(logger.errors) == 1


def test_discarded_report_is_not_flushed():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    for line in REPORT.splitlines()[:2]:
        parser.log(line)
    assert parser.discard(KEY)
    parser.flush()

    assert logger.errors == []


def test_key_of_matches_the_emitted_action():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    feed(parser, REPORT)

    assert UBSanErrorParser.key_of(logger.errors[0]) == KEY


def test_unrelated_output_is_ignored():
    logger = FakeLogger()
    parser = UBSanErrorParser(logger)
    assert not parser.log("    #0 0x1 in main /src/a.c:1:1")
    assert not parser.log("SUMMARY: AddressSanitizer: heap-use-after-free")
    assert not parser.log("foo: note: bar")
    assert not parser.log("")
    parser.flush()

    assert logger.errors == []


if __name__ == "__main__":
    mozunit.main()
