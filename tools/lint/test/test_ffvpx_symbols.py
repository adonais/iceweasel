# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import mozunit

LINTER = "ffvpx-symbols"

WRAPPER = "dom/media/platforms/ffmpeg/FFmpegLibWrapper.cpp"


def _write(root, rel, content):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _setup_tree(root, entries, major=63, avcodec=(), avutil=()):
    _write(
        root,
        "media/ffvpx/libavcodec/version_major.h",
        f"#define LIBAVCODEC_VERSION_MAJOR {major}\n",
    )
    _write(
        root,
        "media/ffvpx/libavcodec/avcodec.symbols",
        "".join(f"{s}\n" for s in avcodec),
    )
    _write(
        root, "media/ffvpx/libavutil/avutil.symbols", "".join(f"{s}\n" for s in avutil)
    )
    _write(
        root,
        WRAPPER,
        "bool FFmpegLibWrapper::Link() {\n"
        "  AV_FUNC(av_lockmgr_register, AV_FUNC_53)\n"
        f"{entries}"
        "#undef AV_FUNC\n"
        "}\n",
    )


def test_all_symbols_exported(global_lint, tmp_path):
    _setup_tree(
        tmp_path,
        "  AV_FUNC(avcodec_send_packet, AV_FUNC_62 | AV_FUNC_63)\n"
        "  AV_FUNC(av_frame_alloc, AV_FUNC_AVUTIL_63)\n",
        avcodec=["avcodec_send_packet", "av_lockmgr_register"],
        avutil=["av_frame_alloc"],
    )
    assert global_lint([], root=str(tmp_path)) == []


def test_missing_symbol(global_lint, tmp_path):
    _setup_tree(
        tmp_path,
        "  AV_FUNC_OPTION_SILENT(avcodec_get_supported_config,\n"
        "                        AV_FUNC_61 | AV_FUNC_62 | AV_FUNC_63)\n",
        avcodec=["av_lockmgr_register"],
    )
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert "avcodec_get_supported_config" in results[0].message
    assert "does not export it" in results[0].message
    assert "AV_FUNC_OPTION_SILENT" in results[0].message
    assert "media/ffvpx/libavcodec/avcodec.symbols" in results[0].message
    assert results[0].path.endswith(WRAPPER)
    assert results[0].lineno == 3


def test_inactive_entry_is_ignored(global_lint, tmp_path):
    """An entry that stops before the bundled version cannot affect ffvpx."""
    _setup_tree(
        tmp_path,
        "  AV_FUNC_OPTION(av_gone_in_63, AV_FUNC_58 | AV_FUNC_59)\n",
        avcodec=["av_lockmgr_register"],
    )
    assert global_lint([], root=str(tmp_path)) == []


def test_wildcard_masks_are_active(global_lint, tmp_path):
    _setup_tree(
        tmp_path,
        "  AV_FUNC(avcodec_open2, AV_FUNC_AVCODEC_ALL)\n"
        "  AV_FUNC(av_log, AV_FUNC_AVUTIL_ALL)\n",
        avcodec=["av_lockmgr_register"],
    )
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 2
    assert {"avcodec_open2", "av_log"} == {r.message.split()[0] for r in results}


def test_wrong_mask_family(global_lint, tmp_path):
    """An avutil symbol bound with an avcodec mask is looked up in the wrong
    handle. dlsym walks the dependency tree so this happens to work on ELF, but
    GetProcAddress does not, so it breaks on Windows only."""
    _setup_tree(
        tmp_path,
        "  AV_FUNC_OPTION_SILENT(av_hwframe_constraints_free,\n"
        "                        AV_FUNC_62 | AV_FUNC_63)\n",
        avcodec=["av_lockmgr_register"],
        avutil=["av_hwframe_constraints_free"],
    )
    results = global_lint([], root=str(tmp_path))
    assert len(results) == 1
    assert "exported by avutil" in results[0].message
    assert "AV_FUNC_AVUTIL_<version>" in results[0].message


def test_guarded_symbols_count_as_exported(global_lint, tmp_path):
    """The .symbols files are preprocessed; a conditionally exported name is
    still wired up, so it must not be reported."""
    _setup_tree(
        tmp_path,
        "  AV_FUNC_OPTION_SILENT(av_vk_frame_alloc, AV_FUNC_AVUTIL_63)\n",
        avcodec=["av_lockmgr_register"],
        avutil=[
            "#if defined(MOZ_ENABLE_VULKAN_VIDEO)",
            "av_vk_frame_alloc",
            "#endif",
        ],
    )
    assert global_lint([], root=str(tmp_path)) == []


def test_version_bump_activates_entries(global_lint, tmp_path):
    """The same tree is clean at 62 and broken at 63: this is exactly the
    regression an ffvpx major bump introduces."""
    entries = "  AV_FUNC_OPTION_SILENT(av_new_in_63, AV_FUNC_63)\n"
    _setup_tree(tmp_path, entries, major=62, avcodec=["av_lockmgr_register"])
    assert global_lint([], root=str(tmp_path)) == []

    _setup_tree(tmp_path, entries, major=63, avcodec=["av_lockmgr_register"])
    assert len(global_lint([], root=str(tmp_path))) == 1


if __name__ == "__main__":
    mozunit.main()
