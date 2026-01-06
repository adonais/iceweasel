# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import logging
import os
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
from collections.abc import Generator
from io import BytesIO
from pathlib import Path
from textwrap import dedent
from typing import Any, Optional, Union

from taskcluster.exceptions import TaskclusterRestFailure

try:
    import zstandard as zstd
except ImportError as e:
    zstd = e

from taskgraph.config import GraphConfig
from taskgraph.generator import load_tasks_for_kind
from taskgraph.transforms import docker_image
from taskgraph.util import docker, json
from taskgraph.util.caches import CACHES
from taskgraph.util.taskcluster import (
    find_task_id,
    get_artifact_url,
    get_root_url,
    get_session,
    get_task_definition,
    status_task,
)
from taskgraph.util.vcs import get_repository

logger = logging.getLogger(__name__)
RUN_TASK_RE = re.compile(r"run-task(-(git|hg))?$")


def get_image_digest(image_name: str) -> str:
    """Get the digest of a docker image by its name.

    Args:
        image_name: The name of the docker image to get the digest for.

    Returns:
        str: The digest string of the cached docker image task.
    """
    from taskgraph.generator import load_tasks_for_kind  # noqa: PLC0415
    from taskgraph.parameters import Parameters  # noqa: PLC0415

    params = Parameters(
        level=os.environ.get("MOZ_SCM_LEVEL", "3"),
        strict=False,
    )
    tasks = load_tasks_for_kind(params, "docker-image")
    task = tasks[f"docker-image-{image_name}"]
    return task.attributes["cached_task"]["digest"]


def load_image_by_name(image_name: str, tag: Optional[str] = None) -> Optional[str]:
    """Load a docker image by its name.

    Finds the appropriate docker image task by name and loads it from
    the indexed artifacts.

    Args:
        image_name: The name of the docker image to load.
        tag: Optional tag to apply to the loaded image. If not provided,
            uses the tag from the image artifact.

    Returns:
        str or None: The full image tag (name:tag) if successful, None if
            the image artifacts could not be found.
    """
    from taskgraph.generator import load_tasks_for_kind  # noqa: PLC0415
    from taskgraph.optimize.strategies import IndexSearch  # noqa: PLC0415
    from taskgraph.parameters import Parameters  # noqa: PLC0415

    params = Parameters(
        level=os.environ.get("MOZ_SCM_LEVEL", "3"),
        strict=False,
    )
    tasks = load_tasks_for_kind(params, "docker-image")
    task = tasks[f"docker-image-{image_name}"]

    indexes = task.optimization.get("index-search", [])
    task_id = IndexSearch().should_replace_task(task, {}, None, indexes)

    if task_id in (True, False):
        logger.error(
            "Could not find artifacts for a docker image "
            f"named `{image_name}`. Local commits and other changes "
            "in your checkout may cause this error. Try "
            f"updating to a fresh checkout of {params['project']} "
            "to download image."
        )
        return None

    return load_image_by_task_id(task_id, tag)


def load_image_by_task_id(task_id: str, tag: Optional[str] = None) -> str:
    """Load a docker image from a task's artifacts.

    Downloads and loads a docker image from the specified task's
    public/image.tar.zst artifact.

    Args:
        task_id: The task ID containing the docker image artifact.
        tag: Optional tag to apply to the loaded image. If not provided,
            uses the tag from the image artifact.

    Returns:
        str: The full image tag (name:tag) that was loaded.
    """
    artifact_url = get_artifact_url(task_id, "public/image.tar.zst")
    result = load_image(artifact_url, tag)
    logger.info(f"Found docker image: {result['image']}:{result['tag']}")
    if tag:
        logger.info(f"Re-tagged as: {tag}")
    else:
        tag = f"{result['image']}:{result['tag']}"
    logger.info(f"Try: docker run -ti --rm {tag} bash")
    return tag


def build_image(
    graph_config: GraphConfig,
    name: str,
    context_file: Optional[str] = None,
    save_image: Optional[str] = None,
) -> str:
    """Build a Docker image of specified name.

    Builds a Docker image from the specified image directory.

    Args:
        graph_config: The graph configuration.
        name: The name of the Docker image to build.
        context_file: Path to save the docker context to. If specified,
            only the context is generated and the image isn't built.
        save_image: If specified, the resulting `image.tar` will be saved to
            the specified path. Otherwise, the image is loaded into docker.

    Returns:
        str: The tag of the loaded image, or absolute path to the image
            if save_image is specified.

    Raises:
        ValueError: If name is not provided.
        Exception: If the image directory does not exist.
    """
    logger.info(f"Building {name} image")
    if not name:
        raise ValueError("must provide a Docker image name")

    image_dir = docker.image_path(name, graph_config)
    if not os.path.isdir(image_dir):
        raise Exception(f"image directory does not exist: {image_dir}")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        # Ensure the docker-image transforms save the docker-contexts to our
        # temp_dir
        label = f"docker-image-{name}"
        contexts_dir = temp_dir / "docker-contexts"
        old_contexts_dir = docker_image.CONTEXTS_DIR
        try:
            docker_image.CONTEXTS_DIR = str(contexts_dir)
            image_tasks = load_tasks_for_kind(
                {"do_not_optimize": [label]},
                "docker-image",
                graph_attr="morphed_task_graph",
                write_artifacts=True,
            )
        finally:
            docker_image.CONTEXTS_DIR = old_contexts_dir

        image_context = contexts_dir.joinpath(f"{name}.tar.gz").resolve()
        if context_file:
            shutil.move(image_context, context_file)
            return ""

        output_dir = temp_dir / "out"
        output_dir.mkdir()
        volumes = [
            # TODO write artifacts to tmpdir
            (str(output_dir), "/workspace/out"),
            (str(image_context), "/workspace/context.tar.gz"),
        ]

        assert label in image_tasks
        task = image_tasks[label]
        task_def = task.task

        # If the image we're building has a parent image, it may need to be
        # rebuilt as well if it's cached_task hash changed.
        if parent_id := task_def["payload"].get("env", {}).get("PARENT_TASK_ID"):
            try:
                status_task(parent_id)
            except TaskclusterRestFailure as e:
                if e.status_code != 404:
                    raise

                # Parent id doesn't exist, needs to be re-built as well.
                parent = task.dependencies["parent"][len("docker-image-") :]
                parent_tar = temp_dir / "parent.tar"
                build_image(graph_config, parent, save_image=str(parent_tar))
                volumes.append((str(parent_tar), "/workspace/parent.tar"))

        task_def["payload"]["env"]["CHOWN_OUTPUT"] = f"{os.getuid()}:{os.getgid()}"
        load_task(
            graph_config,
            task_def,
            custom_image=docker_image.IMAGE_BUILDER_IMAGE,
            interactive=False,
            volumes=volumes,
        )
        logger.info(f"Successfully built {name} image")

        image_tar = output_dir / "image.tar"
        if save_image:
            result = Path(save_image).resolve()
            shutil.copy(image_tar, result)
        else:
            proc = subprocess.run(
                ["docker", "load", "-i", str(image_tar)],
                check=True,
                capture_output=True,
                text=True,
            )
            logger.info(proc.stdout)

            m = re.match(r"^Loaded image: (\S+)$", proc.stdout)
            if m:
                result = m.group(1)
            else:
                result = f"{name}:latest"

    return str(result)


def load_image(
    url: str, imageName: Optional[str] = None, imageTag: Optional[str] = None
) -> dict[str, str]:
    """Load docker image from URL as imageName:tag.

    Downloads a zstd-compressed docker image tarball from the given URL and
    loads it into the local Docker daemon. If no imageName or tag is given,
    it will use whatever is inside the compressed tarball.

    Args:
        url: URL to download the zstd-compressed docker image from.
        imageName: Optional name to give the loaded image. If provided
            without imageTag, will parse tag from name or default to 'latest'.
        imageTag: Optional tag to give the loaded image.

    Returns:
        dict: An object with properties 'image', 'tag' and 'layer' containing
            information about the loaded image.

    Raises:
        ImportError: If zstandard package is not installed.
        Exception: If the tar contains multiple images/tags or no repositories file.
    """
    if isinstance(zstd, ImportError):
        raise ImportError(
            dedent(
                """
                zstandard is not installed! Use `pip install taskcluster-taskgraph[load-image]`
                to use this feature.
                """
            )
        ) from zstd

    # If imageName is given and we don't have an imageTag
    # we parse out the imageTag from imageName, or default it to 'latest'
    # if no imageName and no imageTag is given, 'repositories' won't be rewritten
    if imageName and not imageTag:
        if ":" in imageName:
            imageName, imageTag = imageName.split(":", 1)
        else:
            imageTag = "latest"

    info: dict[str, str] = {}

    def download_and_modify_image() -> Generator[bytes, None, None]:
        # This function downloads and edits the downloaded tar file on the fly.
        # It emits chunked buffers of the edited tar file, as a generator.
        logger.info(f"Downloading from {url}")
        # get_session() gets us a requests.Session set to retry several times.
        req = get_session().get(url, stream=True)
        req.raise_for_status()

        with zstd.ZstdDecompressor().stream_reader(req.raw) as ifh:  # type: ignore
            tarin = tarfile.open(
                mode="r|",
                fileobj=ifh,
                bufsize=zstd.DECOMPRESSION_RECOMMENDED_OUTPUT_SIZE,  # type: ignore
            )

            # Stream through each member of the downloaded tar file individually.
            for member in tarin:
                # Non-file members only need a tar header. Emit one.
                if not member.isfile():
                    yield member.tobuf(tarfile.GNU_FORMAT)
                    continue

                # Open stream reader for the member
                reader = tarin.extractfile(member)

                # If the member is `manifest.json` and we're retagging the image,
                # override RepoTags.
                if member.name == "manifest.json" and imageName:
                    manifest = json.loads(reader.read())  # type: ignore
                    reader.close()  # type: ignore

                    if len(manifest) > 1:
                        raise Exception("file contains more than one manifest")

                    manifest[0]["RepoTags"] = [f"{imageName}:{imageTag}"]

                    data = json.dumps(manifest)
                    reader = BytesIO(data.encode("utf-8"))
                    member.size = len(data)

                # If member is `repositories`, we parse and possibly rewrite the
                # image tags.
                if member.name == "repositories":
                    # Read and parse repositories
                    repos = json.loads(reader.read())  # type: ignore
                    reader.close()  # type: ignore

                    # If there is more than one image or tag, we can't handle it
                    # here.
                    if len(repos.keys()) > 1:
                        raise Exception("file contains more than one image")
                    info["image"] = image = list(repos.keys())[0]
                    if len(repos[image].keys()) > 1:
                        raise Exception("file contains more than one tag")
                    info["tag"] = tag = list(repos[image].keys())[0]
                    info["layer"] = layer = repos[image][tag]

                    # Rewrite the repositories file
                    data = json.dumps({imageName or image: {imageTag or tag: layer}})
                    reader = BytesIO(data.encode("utf-8"))
                    member.size = len(data)

                # Emit the tar header for this member.
                yield member.tobuf(tarfile.GNU_FORMAT)
                # Then emit its content.
                remaining = member.size
                while remaining:
                    length = min(remaining, zstd.DECOMPRESSION_RECOMMENDED_OUTPUT_SIZE)  # type: ignore
                    buf = reader.read(length)  # type: ignore
                    remaining -= len(buf)
                    yield buf
                # Pad to fill a 512 bytes block, per tar format.
                remainder = member.size % 512
                if remainder:
                    yield ("\0" * (512 - remainder)).encode("utf-8")

                reader.close()  # type: ignore

    subprocess.run(
        ["docker", "image", "load"], input=b"".join(download_and_modify_image())
    )

    # Check that we found a repositories file
    if not info.get("image") or not info.get("tag") or not info.get("layer"):
        raise Exception("No repositories file found!")

    return info


def _index(l: list, s: str) -> Optional[int]:
    try:
        return l.index(s)
    except ValueError:
        pass


def _extract_arg(cmd: list[str], arg: str) -> Optional[str]:
    if index := _index(cmd, arg):
        return cmd[index + 1]

    for item in cmd:
        if item.startswith(f"{arg}="):
            return item.split("=", 1)[1]


def _delete_arg(cmd: list[str], arg: str) -> bool:
    if index := _index(cmd, arg):
        del cmd[index : index + 2]
        return True

    for i, item in enumerate(cmd):
        if item.startswith(f"{arg}="):
            del cmd[i]
            return True
    return False


def _resolve_image(image: Union[str, dict[str, str]], graph_config: GraphConfig) -> str:
    image_task_id = None

    # Standard case, image comes from the task definition.
    if isinstance(image, dict):
        assert "type" in image

        if image["type"] == "task-image":
            image_task_id = image["taskId"]
        elif image["type"] == "indexed-image":
            image_task_id = find_task_id(image["namespace"])
        else:
            raise Exception(f"Tasks with {image['type']} images are not supported!")
    else:
        # Check if image refers to an in-tree image under taskcluster/docker,
        # if so build it.
        image_dir = docker.image_path(image, graph_config)
        if Path(image_dir).is_dir():
            return build_image(graph_config, image)

        # Check if we're referencing a task or index.
        if image.startswith("task-id="):
            image_task_id = image.split("=", 1)[1]
        elif image.startswith("index="):
            index = image.split("=", 1)[1]
            image_task_id = find_task_id(index)
        else:
            # Assume the string references an image from a registry.
            return image

    return load_image_by_task_id(image_task_id)


def _is_run_task(task_def: dict[str, str]):
    cmd = task_def["payload"].get("command")  # type: ignore
    return cmd and re.search(RUN_TASK_RE, cmd[0])


def load_task(
    graph_config: GraphConfig,
    task: Union[str, dict[str, Any]],
    remove: bool = True,
    user: Optional[str] = None,
    custom_image: Optional[str] = None,
    interactive: Optional[bool] = False,
    volumes: Optional[list[tuple[str, str]]] = None,
    develop: bool = False,
) -> int:
    """Load and run a task interactively in a Docker container.

    Downloads the docker image from a task's definition and runs it in an
    interactive shell, setting up the task environment but not executing
    the actual task command. The task command can be executed later using
    the 'exec-task' function provided in the shell.

    Args:
        graph_config: The graph configuration object.
        task: The ID of the task, or task definition to load.
        remove: Whether to remove the container after exit (default True).
        user: The user to switch to in the container (default 'worker').
        custom_image: A custom image to use instead of the task's image.
        interactive: If True, execution of the task will be paused and user
          will be dropped into a shell. They can run `exec-task` to resume
          it (default: False).
        develop: If True, the task will be configured to use the current
          local checkout at the current revision (default: False).

    Returns:
        int: The exit code from the Docker container.
    """
    user = user or "worker"
    if isinstance(task, str):
        task_id = task
        task_def = get_task_definition(task)
        source = f"task {task_id}"
    else:
        # We're running a locally generated definition and don't have a proper id.
        task_id = "fake"
        task_def = task
        source = "provided definition"

    logger.info(f"Loading '{task_def['metadata']['name']}' from {source}")

    if "payload" not in task_def or not (image := task_def["payload"].get("image")):
        logger.error("Tasks without a `payload.image` are not supported!")

        return 1

    is_run_task = _is_run_task(task_def)
    if interactive and not is_run_task:
        logger.error("Only tasks using `run-task` are supported with --interactive!")
        return 1

    if develop and not is_run_task:
        logger.error("Only tasks using `run-task` are supported with --develop!")
        return 1

    try:
        image = custom_image or image
        image_tag = _resolve_image(image, graph_config)
    except Exception as e:
        logger.exception(e)
        return 1

    task_command = task_def["payload"].get("command")  # type: ignore
    task_env = task_def["payload"].get("env", {})

    if develop:
        repositories = json.loads(task_env.get("REPOSITORIES", "{}"))
        if not repositories:
            logger.error(
                "Can't use --develop with task that doesn't define any $REPOSITORIES!"
            )
            return 1

        try:
            repo = get_repository(os.getcwd())
        except RuntimeError:
            logger.error("Can't use --develop from outside a source repository!")
            return 1

        checkout_name = list(repositories.keys())[0]
        checkout_arg = f"--{checkout_name}-checkout"
        checkout_dir = _extract_arg(task_command, checkout_arg)
        if not checkout_dir:
            logger.error(
                f"Can't use --develop with task that doesn't use {checkout_arg}"
            )
            return 1
        volumes = volumes or []
        volumes.append((repo.path, checkout_dir))

        # Delete cache environment variables for cache directories that aren't mounted.
        # This prevents tools from trying to write to inaccessible cache paths.
        mount_paths = {v[1] for v in volumes}
        for cache in CACHES.values():
            var = cache.get("env")
            if var in task_env and task_env[var] not in mount_paths:
                del task_env[var]

        # Delete environment and arguments related to this repo so that
        # `run-task` doesn't attempt to fetch or checkout a new revision.
        del repositories[checkout_name]
        task_env["REPOSITORIES"] = json.dumps(repositories)
        for arg in ("checkout", "sparse-profile", "shallow-clone"):
            _delete_arg(task_command, f"--{checkout_name}-{arg}")

    exec_command = task_cwd = None
    if interactive:
        # Remove the payload section of the task's command. This way run-task will
        # set up the task (clone repos, download fetches, etc) but won't actually
        # start the core of the task. Instead we'll drop the user into an interactive
        # shell and provide the ability to resume the task command.
        if index := _index(task_command, "--"):
            exec_command = shlex.join(task_command[index + 1 :])
            # I attempted to run the interactive bash shell here, but for some
            # reason when executed through `run-task`, the interactive shell
            # doesn't work well. There's no shell prompt on newlines and tab
            # completion doesn't work. That's why it is executed outside of
            # `run-task` below, and why we need to parse `--task-cwd`.
            task_command[index + 1 :] = [
                "echo",
                "Task setup complete!\nRun `exec-task` to execute the task's command.",
            ]

        # Parse `--task-cwd` so we know where to execute the task's command later.
        task_cwd = _extract_arg(task_command, "--task-cwd") or "$TASK_WORKDIR"
        task_command = [
            "bash",
            "-c",
            f"{shlex.join(task_command)} && cd $TASK_WORKDIR && su -p {user}",
        ]

    # Set some env vars the worker would normally set.
    env = {
        "RUN_ID": "0",
        "TASK_GROUP_ID": task_def.get("taskGroupId", ""),  # type: ignore
        "TASK_ID": task_id,
        "TASKCLUSTER_ROOT_URL": get_root_url(),
    }
    # Add the task's environment variables.
    env.update(task_env)  # type: ignore

    # run-task expects the worker to mount a volume for each path defined in
    # TASKCLUSTER_CACHES; delete them to avoid needing to do the same, unless
    # they're passed in as volumes.
    if "TASKCLUSTER_CACHES" in env:
        if volumes:
            caches = env["TASKCLUSTER_CACHES"].split(";")
            caches = [
                cache for cache in caches if any(path == cache for _, path in volumes)
            ]
        else:
            caches = []
        if caches:
            env["TASKCLUSTER_CACHES"] = ";".join(caches)
        else:
            del env["TASKCLUSTER_CACHES"]

    # run-task expects volumes listed under `TASKCLUSTER_VOLUMES` to be empty.
    # This can interfere with load-task when using custom volumes.
    if volumes and "TASKCLUSTER_VOLUMES" in env:
        del env["TASKCLUSTER_VOLUMES"]

    envfile = None
    initfile = None
    isatty = os.isatty(sys.stdin.fileno())
    try:
        command = [
            "docker",
            "run",
            "-i",
        ]

        if isatty:
            command.append("-t")

        if remove:
            command.append("--rm")

        if env:
            envfile = tempfile.NamedTemporaryFile("w+", delete=False)
            envfile.write("\n".join([f"{k}={v}" for k, v in env.items()]))
            envfile.close()

            command.append(f"--env-file={envfile.name}")

        if exec_command:
            initfile = tempfile.NamedTemporaryFile("w+", delete=False)
            os.fchmod(initfile.fileno(), 0o644)
            initfile.write(
                dedent(
                    f"""
            function exec-task() {{
                echo Starting task: {shlex.quote(exec_command)}
                pushd {task_cwd}
                {exec_command}
                popd
            }}
            """
                ).lstrip()
            )
            initfile.close()

            command.extend(["-v", f"{initfile.name}:/builds/worker/.bashrc"])

        if volumes:
            for k, v in volumes:
                command.extend(["-v", f"{k}:{v}"])

        command.append(image_tag)

        if task_command:
            command.extend(task_command)

        logger.info(f"Running: {' '.join(command)}")
        proc = subprocess.run(command)
    finally:
        if envfile:
            os.remove(envfile.name)

        if initfile:
            os.remove(initfile.name)

    return proc.returncode
