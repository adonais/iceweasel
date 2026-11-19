# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import multiprocessing
import time
from concurrent.futures import ProcessPoolExecutor

import pytest
from mozsystemmonitor.resourcemonitor import FORWARD_ENV, SystemResourceMonitor
from mozunit import main

from gecko_taskgraph import record_phase_marker
from gecko_taskgraph.kind import ProfiledKind
from gecko_taskgraph.test.conftest import fake_load_graph_config


@pytest.fixture
def kinds_dir(tmp_path):
    for name, loader in (
        ("fake", "gecko_taskgraph.test.conftest:fake_loader"),
        ("failing", "gecko_taskgraph.test.test_kind:failing_loader"),
    ):
        kind_dir = tmp_path / "kinds" / name
        kind_dir.mkdir(parents=True)
        (kind_dir / "kind.yml").write_text(f"loader: {loader}\ntransforms: []\n")
    return tmp_path


def failing_loader(kind, path, config, parameters, loaded_tasks, write_artifacts):
    raise ValueError("broken kind")


@pytest.fixture
def monitor(tmp_path, monkeypatch):
    # The monitor running the tests in automation isn't the one to forward to.
    monkeypatch.delenv(FORWARD_ENV, raising=False)
    monitor = SystemResourceMonitor(poll_interval=0.1)
    monitor.start()
    if SystemResourceMonitor.instance is not monitor:
        pytest.skip("Resource monitor requires psutil.")
    forward_path = tmp_path / "forward.jsonl"
    forward_path.touch()
    monitor.accept_forwarded(str(forward_path))
    yield monitor
    if SystemResourceMonitor.instance is monitor:
        monitor.stop()


@pytest.mark.parametrize(
    "start_method", [None] + multiprocessing.get_all_start_methods()
)
def test_profiled_kind_marker(kinds_dir, monitor, start_method):
    graph_config = fake_load_graph_config(str(kinds_dir))
    kind = ProfiledKind.load(str(kinds_dir), graph_config, "fake")
    assert kind.forward_path == monitor.children_forward_path

    if start_method is None:
        tasks = kind.load_tasks({}, {}, False)
    else:
        context = multiprocessing.get_context(start_method)
        with ProcessPoolExecutor(max_workers=1, mp_context=context) as executor:
            tasks = executor.submit(kind.load_tasks, {}, {}, False).result()
    monitor.stop()

    assert [t.label for t in tasks] == ["fake-t-0", "fake-t-1", "fake-t-2"]
    markers = [m for m in monitor.markers if m[0] == "Kind"]
    assert len(markers) == 1
    _, start, end, data, _ = markers[0]
    assert monitor.start_time < start < end < monitor.end_time
    assert data == {"type": "Text", "text": "fake (3 tasks)"}

    results = [m for m in monitor.markers if m[0] == "Kind result"]
    if start_method is None:
        assert results == []
    else:
        assert len(results) == 1
        _, result_start, result_end, result_data, _ = results[0]
        assert result_start == end
        assert result_start < result_end < monitor.end_time
        assert result_data == data


def test_profiled_kind_marker_on_failure(kinds_dir, monitor):
    graph_config = fake_load_graph_config(str(kinds_dir))
    kind = ProfiledKind.load(str(kinds_dir), graph_config, "failing")
    with pytest.raises(ValueError, match="broken kind"):
        kind.load_tasks({}, {}, False)
    monitor.stop()

    markers = [m for m in monitor.markers if m[0] == "Kind"]
    assert len(markers) == 1
    _, start, end, data, _ = markers[0]
    assert monitor.start_time < start < end < monitor.end_time
    assert data == {"type": "Text", "text": "failing (failed)"}


def test_profiled_kind_without_monitor(kinds_dir):
    graph_config = fake_load_graph_config(str(kinds_dir))
    kind = ProfiledKind.load(str(kinds_dir), graph_config, "fake")
    assert kind.forward_path is None
    assert len(kind.load_tasks({}, {}, False)) == 3


@pytest.mark.parametrize(
    "name,text", [("full_task_set", "full_task_set"), (None, "failed phase")]
)
def test_record_phase_marker(monitor, name, text):
    start = time.monotonic()
    end = start + 0.5
    record_phase_marker(name, start, end)
    monitor.stop()

    markers = [m[:4] for m in monitor.markers if m[0] == "Taskgraph"]
    assert markers == [("Taskgraph", start, end, {"type": "Text", "text": text})]


if __name__ == "__main__":
    main()
