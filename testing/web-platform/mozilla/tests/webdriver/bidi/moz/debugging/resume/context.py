import asyncio

import pytest
from webdriver.bidi.modules.script import ContextTarget

pytestmark = pytest.mark.asyncio

from .. import PAUSED_EVENT, RESUMED_EVENT


async def test_resume_from_breakpoint(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    assert_pause_and_resume,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])
    await enable_debugging(contexts=[new_tab["context"]])

    url = inline(
        """<script>
function test() {
    const x = 1;
    const y = 2;
    return x + y;
}
</script>"""
    )

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    await set_breakpoint(location={"url": url, "line": 6})

    result = await assert_pause_and_resume(new_tab, expression="test()", line=6)
    assert result["type"] == "number"
    assert result["value"] == 3


async def test_evaluate_in_paused_frame(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])
    await enable_debugging(contexts=[new_tab["context"]])

    url = inline(
        """<script>
function calculate() {
    let b;
    const a = 10;
    b = 20;
    const sum = a + b;
    return sum;
}
</script>"""
    )

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    await set_breakpoint(location={"url": url, "line": 7})
    await set_breakpoint(location={"url": url, "line": 8})

    on_paused = wait_for_event(PAUSED_EVENT)

    eval_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="calculate()",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    # Wait for the pause on line 7 `b = 20;`. Variable `a` should already
    # be at 10, variable `b` should be undefined.
    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["context"] == new_tab["context"]
    assert paused_event["line"] == 7

    result_a = await bidi_session.script.evaluate(
        expression="a", target=ContextTarget(new_tab["context"]), await_promise=False
    )
    assert result_a["type"] == "number"
    assert result_a["value"] == 10

    result_b = await bidi_session.script.evaluate(
        expression="typeof b",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert result_b["type"] == "string"
    assert result_b["value"] == "undefined"

    # Resume and break at line 8 now. Variable `a` should still be at 10,
    # variable `b` should be set to 20 now.
    on_paused = wait_for_event(PAUSED_EVENT)
    await bidi_session.moz.debugging.resume(context=new_tab["context"])
    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["context"] == new_tab["context"]
    assert paused_event["line"] == 8

    result_a = await bidi_session.script.evaluate(
        expression="a", target=ContextTarget(new_tab["context"]), await_promise=False
    )
    assert result_a["type"] == "number"
    assert result_a["value"] == 10

    result_b = await bidi_session.script.evaluate(
        expression="b", target=ContextTarget(new_tab["context"]), await_promise=False
    )
    assert result_b["type"] == "number"
    assert result_b["value"] == 20

    await bidi_session.script.evaluate(
        expression="b = 32",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )

    result_b = await bidi_session.script.evaluate(
        expression="b", target=ContextTarget(new_tab["context"]), await_promise=False
    )
    assert result_b["type"] == "number"
    assert result_b["value"] == 32

    await bidi_session.moz.debugging.resume(context=new_tab["context"])

    result = await eval_task
    assert result["type"] == "number"

    assert result["value"] == 42


async def test_nested_pause_requires_one_resume_per_pause(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])
    await enable_debugging(contexts=[new_tab["context"]])

    # Script for this test.
    # Breakpoints will be set in inner() and outer().
    # outer() will be called first and then inner() will be called while paused.
    url = inline(
        """<script>
function inner() {
    return 21;
}
function outer() {
    const outerVar = 1;
    return outerVar;
}
</script>"""
    )

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    await set_breakpoint(location={"url": url, "line": 5})
    await set_breakpoint(location={"url": url, "line": 9})

    on_paused = wait_for_event(PAUSED_EVENT)

    outer_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="outer()",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["line"] == 9

    # Evaluating in the paused frame runs debuggee code, which can hit another
    # breakpoint and pause a second time.
    on_paused = wait_for_event(PAUSED_EVENT)

    inner_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="inner()",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["line"] == 5

    # Resuming should only unwind the innermost pause.
    on_resumed = wait_for_event(RESUMED_EVENT)
    await bidi_session.moz.debugging.resume(context=new_tab["context"])
    await wait_for_future_safe(on_resumed)

    inner_result = await wait_for_future_safe(inner_task)
    assert inner_result == {"type": "number", "value": 21}

    # The outer frame is still paused and needs its own resume.
    on_resumed = wait_for_event(RESUMED_EVENT)
    await bidi_session.moz.debugging.resume(context=new_tab["context"])
    await wait_for_future_safe(on_resumed)

    outer_result = await wait_for_future_safe(outer_task)
    assert outer_result == {"type": "number", "value": 1}


async def test_nested_pause_restores_enclosing_debugger_environment(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])
    await enable_debugging(contexts=[new_tab["context"]])

    url = inline(
        """<script>
function inner() {
    const innerVar = 21;
    return innerVar;
}
function outer() {
    const outerVar = 1;
    return outerVar;
}
</script>"""
    )

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    await set_breakpoint(location={"url": url, "line": 6})
    await set_breakpoint(location={"url": url, "line": 10})

    on_paused = wait_for_event(PAUSED_EVENT)

    outer_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="outer()",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["line"] == 10

    # Evaluations target the paused frame, so the scope of outer() is reachable.
    outer_var = await bidi_session.script.evaluate(
        expression="outerVar",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert outer_var == {"type": "number", "value": 1}

    # Pause a second time, from an evaluation made in the paused frame.
    on_paused = wait_for_event(PAUSED_EVENT)

    inner_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="inner()",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["line"] == 6

    # Evaluations now target the innermost paused frame.
    inner_var = await bidi_session.script.evaluate(
        expression="innerVar",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert inner_var == {"type": "number", "value": 21}

    on_resumed = wait_for_event(RESUMED_EVENT)
    await bidi_session.moz.debugging.resume(context=new_tab["context"])
    await wait_for_future_safe(on_resumed)

    inner_result = await wait_for_future_safe(inner_task)
    assert inner_result == {"type": "number", "value": 21}

    # Unwinding the nested pause should restore the frame of the enclosing
    # pause, so the scope of outer() should be reachable again.
    outer_var = await bidi_session.script.evaluate(
        expression="outerVar",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert outer_var == {"type": "number", "value": 1}

    on_resumed = wait_for_event(RESUMED_EVENT)
    await bidi_session.moz.debugging.resume(context=new_tab["context"])
    await wait_for_future_safe(on_resumed)

    outer_result = await wait_for_future_safe(outer_task)
    assert outer_result == {"type": "number", "value": 1}


async def test_resume_with_two_paused_contexts(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])
    await enable_debugging(contexts=[new_tab["context"]])

    frame_url = inline(
        """<script>
function frameFn() {
    return 2;
}
</script>"""
    )

    url = inline(
        f"""<iframe src='{frame_url}'></iframe>
<script>
function topFn() {{
    return 1;
}}
</script>"""
    )

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    contexts = await bidi_session.browsing_context.get_tree(root=new_tab["context"])
    frame_context = contexts[0]["children"][0]["context"]

    await set_breakpoint(location={"url": url, "line": 6})
    await set_breakpoint(location={"url": frame_url, "line": 5})

    resumed_contexts = []

    async def on_resumed(method, data):
        resumed_contexts.append(data["context"])

    remove_listener = bidi_session.add_event_listener(RESUMED_EVENT, on_resumed)

    on_paused = wait_for_event(PAUSED_EVENT)

    top_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="topFn()",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["context"] == new_tab["context"]

    # Pause the iframe while the top-level context is paused. Both window
    # globals share the same process, so this nests a second event loop on top
    # of the one spun for the top-level pause.
    on_paused = wait_for_event(PAUSED_EVENT)

    frame_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="frameFn()",
            target=ContextTarget(frame_context),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["context"] == frame_context

    # The event loop of the top-level context cannot be unwound before the one
    # of the iframe, so the top-level context should only be reported as resumed
    # after the iframe.
    await bidi_session.moz.debugging.resume(context=new_tab["context"])

    # Check both tasks have not resolved yet.
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(asyncio.shield(frame_task), timeout=0.5)

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(asyncio.shield(top_task), timeout=0.5)

    await bidi_session.moz.debugging.resume(context=frame_context)

    frame_result = await wait_for_future_safe(frame_task)
    assert frame_result == {"type": "number", "value": 2}

    top_result = await wait_for_future_safe(top_task)
    assert top_result == {"type": "number", "value": 1}

    assert resumed_contexts == [frame_context, new_tab["context"]]

    remove_listener()


async def test_call_function_in_paused_frame(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    wait_for_event,
    wait_for_future_safe,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])
    await enable_debugging(contexts=[new_tab["context"]])

    url = inline(
        """<script>
function add(x, y) {
    const result = x + y;
    return result;
}
</script>"""
    )

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    await set_breakpoint(location={"url": url, "line": 5})

    on_paused = wait_for_event(PAUSED_EVENT)

    eval_task = asyncio.create_task(
        bidi_session.script.evaluate(
            expression="add(3, 4)",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )
    )

    paused_event = await wait_for_future_safe(on_paused)
    assert paused_event["context"] == new_tab["context"]
    assert paused_event["line"] == 5

    # Call a function with an argument while paused. The function also reads
    # `x` from the paused frame's scope (x == 3), so the result is 3 * 5 == 15.
    result = await bidi_session.script.call_function(
        function_declaration="(multiplier) => x * multiplier",
        arguments=[{"type": "number", "value": 5}],
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert result == {"type": "number", "value": 15}

    await bidi_session.moz.debugging.resume(context=new_tab["context"])

    result = await eval_task
    assert result == {"type": "number", "value": 7}
