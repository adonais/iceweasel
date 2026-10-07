# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
import pathlib
import tempfile
from unittest.mock import MagicMock

MOONSHOT_POOL = "releng-hardware/gecko-t-linux-talos-2404"
NETPERF_POOL = "releng-hardware/gecko-t-linux-netperf-2404"
CLOUD_POOL = "gecko-t/t-linux-docker-noscratch-amd"

SAMPLE_HARDWARE_YAML = f"""
hardware:
  moonshot:
    name: HPE Moonshot
    group: Desktop
    reference: https://example.com/moonshot
    description: Some bare metal.
    location: MDC1
    machines: 45 cartridges
    worker-pools:
      - {MOONSHOT_POOL}
      - {NETPERF_POOL}
    specifications:
      Model: m710x
      Memory: 8GB
  cloud-vm:
    name: GCP c3d-standard-8
    group: Virtual machines
    worker-pools:
      - {CLOUD_POOL}
    specifications:
      Memory: 32 GB
"""


def _setup_hardware_logger(mock_logger, structured_logger, top_dir):
    from mozperftest.perfdocs.logger import PerfDocLogger

    PerfDocLogger.LOGGER = structured_logger
    PerfDocLogger.PATHS = ["perfdocs"]
    PerfDocLogger.TOP_DIR = top_dir

    import mozperftest.perfdocs.hardware as hw

    hw.logger = mock_logger


def _hardware_docs(tmp_path, content=SAMPLE_HARDWARE_YAML):
    from mozperftest.perfdocs.hardware import HardwareDocs

    yaml_path = pathlib.Path(tmp_path, "hardware.yml")
    yaml_path.write_text(content)

    # HardwareDocs is a singleton, so it has to be reset to pick up the
    # sample config of each test
    HardwareDocs._instance = None
    return HardwareDocs(yaml_path)


def test_hardware_platform_link(structured_logger):
    with tempfile.TemporaryDirectory() as tmpdir:
        mock_logger = MagicMock()
        _setup_hardware_logger(mock_logger, structured_logger, tmpdir)

        hardware_docs = _hardware_docs(tmpdir)

        assert hardware_docs.get_hardware_key(MOONSHOT_POOL) == "moonshot"
        assert hardware_docs.get_platform_link(
            "test-linux2404-64/opt", [MOONSHOT_POOL]
        ) == ("{ref}`test-linux2404-64/opt <hardware-moonshot>`")
        assert mock_logger.warning.call_count == 0


def test_hardware_platform_link_same_hardware_pools(structured_logger):
    with tempfile.TemporaryDirectory() as tmpdir:
        mock_logger = MagicMock()
        _setup_hardware_logger(mock_logger, structured_logger, tmpdir)

        hardware_docs = _hardware_docs(tmpdir)

        # Both pools are made of the same hardware, so a single reference is
        # expected on the platform itself
        assert hardware_docs.get_platform_link(
            "test-linux2404-64/opt", [MOONSHOT_POOL, NETPERF_POOL]
        ) == ("{ref}`test-linux2404-64/opt <hardware-moonshot>`")
        assert mock_logger.warning.call_count == 0


def test_hardware_missing_pool_mapping_warns(structured_logger):
    with tempfile.TemporaryDirectory() as tmpdir:
        mock_logger = MagicMock()
        _setup_hardware_logger(mock_logger, structured_logger, tmpdir)

        hardware_docs = _hardware_docs(tmpdir)

        assert hardware_docs.get_platform_link(
            "test-linux2404-64/opt", ["gecko-t/nonexistent"]
        ) == ("test-linux2404-64/opt")
        assert mock_logger.warning.call_count == 1
        assert "Missing a hardware mapping" in mock_logger.warning.call_args[0][0]

        # The same pool should only be warned about once
        hardware_docs.record_platform("test-linux2404-64/opt", "gecko-t/nonexistent")
        assert mock_logger.warning.call_count == 1


def test_hardware_documentation(structured_logger):
    with tempfile.TemporaryDirectory() as tmpdir:
        mock_logger = MagicMock()
        _setup_hardware_logger(mock_logger, structured_logger, tmpdir)

        hardware_docs = _hardware_docs(tmpdir)
        hardware_docs.record_platform("test-linux2404-64/opt", MOONSHOT_POOL)
        hardware_docs.record_platform("test-linux2404-64-shippable/opt", MOONSHOT_POOL)
        hardware_docs.record_platform("test-linux2404-64/opt", CLOUD_POOL)

        documentation = "\n".join(hardware_docs.build_hardware_documentation())

        assert "### Desktop" in documentation
        assert "### Virtual machines" in documentation
        assert "(hardware-moonshot)=" in documentation
        assert "#### [HPE Moonshot](https://example.com/moonshot)" in documentation
        assert "#### GCP c3d-standard-8" in documentation
        assert "* **Location**: MDC1" in documentation
        assert "* **Machines**: 45 cartridges" in documentation
        assert "Model: m710x" in documentation

        # The platforms are nested under the pool they were found on, and the
        # pools that run no documented test are still listed
        assert (
            f"  * `{MOONSHOT_POOL}`\n"
            "    * `test-linux2404-64-shippable/opt`\n"
            "    * `test-linux2404-64/opt`\n"
            f"  * `{NETPERF_POOL}`\n"
        ) in documentation
        assert (f"  * `{CLOUD_POOL}`\n    * `test-linux2404-64/opt`\n") in documentation
        assert mock_logger.warning.call_count == 0


def test_hardware_in_tree_config_is_valid(structured_logger):
    with tempfile.TemporaryDirectory() as tmpdir:
        mock_logger = MagicMock()
        _setup_hardware_logger(mock_logger, structured_logger, tmpdir)

        from mozperftest.perfdocs.hardware import HardwareDocs

        HardwareDocs._instance = None
        hardware_docs = HardwareDocs()
        documentation = hardware_docs.build_hardware_documentation()

        assert documentation
        assert mock_logger.warning.call_count == 0


def test_hardware_gatherer_platform_title(structured_logger):
    with tempfile.TemporaryDirectory() as tmpdir:
        _setup_hardware_logger(MagicMock(), structured_logger, tmpdir)

        from mozperftest.perfdocs.framework_gatherers import AwsyGatherer

        yaml_path = pathlib.Path(tmpdir, "config.yml")
        yaml_path.write_text("name: awsy\nmanifest: None\nstatic-only: False\n")

        gatherer = AwsyGatherer(yaml_path, tmpdir)
        gatherer._hardware_docs = _hardware_docs(tmpdir)

        task_def = {
            "provisionerId": CLOUD_POOL.split("/", maxsplit=1)[0],
            "workerType": CLOUD_POOL.split("/")[1],
        }
        pool = gatherer.record_worker_pool("test-linux2404-64/opt", task_def)

        assert pool == CLOUD_POOL
        assert gatherer.get_platform_title(
            "test-linux2404-64/opt", [{"worker_pool": pool}]
        ) == ("{ref}`test-linux2404-64/opt <hardware-cloud-vm>`")
