// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

#![forbid(unsafe_code)]

use std::collections::HashMap;
use std::os::unix::fs::chown;
use std::path::Path;
use std::process::Command;

use anyhow::{ensure, Context, Result};
use fs_extra::dir::{move_dir, CopyOptions};
use serde::Deserialize;

mod config;
mod taskcluster;

use config::Config;

fn log_step(msg: &str) {
    println!("[build-image] {}", msg);
}

fn read_image_digest(path: &str) -> Result<String> {
    let output = Command::new("/kaniko/skopeo")
        .arg("inspect")
        .arg(format!("docker-archive:{}", path))
        .stdout(std::process::Stdio::piped())
        .spawn()?
        .wait_with_output()?;
    ensure!(
        output.status.success(),
        format!("Could not inspect parent image: {}", output.status)
    );

    #[derive(Deserialize, Debug)]
    #[serde(rename_all = "PascalCase")]
    struct ImageInfo {
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tag: Option<String>,
        digest: String,
        // ...
    }

    let image_info: ImageInfo = serde_json::from_slice(&output.stdout)
        .with_context(|| format!("Could parse image info from {:?}", path))?;
    Ok(image_info.digest)
}

fn download_parent_image(
    cluster: &taskcluster::TaskCluster,
    task_id: &str,
    dest: &str,
) -> Result<String> {
    zstd::stream::copy_decode(
        cluster.stream_artifact(&task_id, "public/image.tar.zst")?,
        std::fs::File::create(dest)?,
    )
    .context("Could not download parent image.")?;

    read_image_digest(dest)
}

fn build_image(
    context_path: &str,
    dest: &str,
    debug: bool,
    build_args: HashMap<String, String>,
) -> Result<()> {
    let mut command = Command::new("/kaniko/executor");
    command
        .stderr(std::process::Stdio::inherit())
        .args(&["--context", &format!("tar://{}", context_path)])
        .args(&["--destination", "image"])
        .args(&["--dockerfile", "Dockerfile"])
        .args(&["--no-push", "--no-push-cache"])
        .args(&[
            "--cache=true",
            "--cache-dir",
            "/workspace/cache",
            "--cache-repo",
            "oci:/workspace/repo",
        ])
        .arg("--single-snapshot")
        // Compressed caching causes OOM with large images
        .arg("--compressed-caching=false")
        // FIXME: Generating reproducible layers currently causes OOM.
        // .arg("--reproducible")
        .arg("--ignore-var-run=false")
        .args(&["--tarPath", dest]);
    if debug {
        command.args(&["-v", "debug"]);
    }
    for (key, value) in build_args {
        command.args(&["--build-arg", &format!("{}={}", key, value)]);
    }
    let status = command.status()?;
    ensure!(
        status.success(),
        format!("Could not build image: {}", status)
    );
    Ok(())
}

/// Rewrite the `architecture` field of the image config inside a docker-archive
/// tarball.
///
/// kaniko stamps the output config with the architecture of the build host (or
/// amd64 for a `FROM scratch` image). `image_builder_arm64` is cross-built on an
/// amd64 worker, so its metadata ends up claiming amd64. There is no kaniko or
/// skopeo flag to override only the resulting metadata (kaniko's
/// `--custom-platform` also changes the platform used to pull base images and
/// run build steps), so we patch the config blob in place. The config filename
/// in `manifest.json` is left untouched; skopeo recomputes the config digest
/// from its contents when repacking.
fn set_image_architecture(tar_path: &Path, arch: &str) -> Result<()> {
    #[derive(Deserialize)]
    struct ManifestEntry {
        #[serde(rename = "Config")]
        config: String,
    }

    let config_path = {
        let mut archive = tar::Archive::new(std::fs::File::open(tar_path)?);
        let mut config_name = None;
        for entry in archive.entries()? {
            let mut entry = entry?;
            if entry.path()?.to_str() == Some("manifest.json") {
                let manifest: Vec<ManifestEntry> =
                    serde_json::from_reader(&mut entry).context("Could not parse manifest.json")?;
                config_name = manifest.into_iter().next().map(|m| m.config);
                break;
            }
        }
        config_name.context("Image archive has no manifest.json entry")?
    };

    let tmp_path = tar_path.with_extension("arch.tar");
    {
        let mut archive = tar::Archive::new(std::fs::File::open(tar_path)?);
        let mut builder = tar::Builder::new(std::fs::File::create(&tmp_path)?);
        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?.into_owned();
            let mut header = entry.header().clone();
            if path.to_str() == Some(config_path.as_str()) {
                let mut config: serde_json::Value =
                    serde_json::from_reader(&mut entry).context("Could not parse image config")?;
                config["architecture"] = serde_json::Value::String(arch.to_string());
                let data = serde_json::to_vec(&config)?;
                header.set_size(data.len() as u64);
                builder.append_data(&mut header, &path, data.as_slice())?;
            } else {
                builder.append_data(&mut header, &path, &mut entry)?;
            }
        }
        builder.finish()?;
    }
    std::fs::rename(&tmp_path, tar_path)?;
    Ok(())
}

fn repack_image(source: &str, dest: &str, image_name: &str) -> Result<()> {
    let status = Command::new("/kaniko/skopeo")
        .arg("copy")
        .arg(format!("docker-archive:{}", source))
        .arg(format!("docker-archive:{}:{}", dest, image_name))
        .stderr(std::process::Stdio::inherit())
        .status()?;
    ensure!(
        status.success(),
        format!("Could not repack image: {}", status)
    );
    Ok(())
}

fn main() -> Result<()> {
    // Kaniko expects everything to be in /kaniko, so if not running from there, move
    // everything there.
    if let Some(path) = std::env::current_exe()?.parent() {
        if path != Path::new("/kaniko") {
            let mut options = CopyOptions::new();
            options.copy_inside = true;
            move_dir(path, "/kaniko", &options)?;
        }
    }

    let config = Config::from_env().context("Could not parse environment variables.")?;

    let cluster = taskcluster::TaskCluster::from_env()?;

    let mut build_args = config.docker_build_args;

    build_args.insert("TASKCLUSTER_ROOT_URL".into(), cluster.root_url());

    let output_dir = Path::new("/workspace/out");
    if !output_dir.is_dir() {
        std::fs::create_dir_all(output_dir)?;
    }

    let context_path = Path::new("/workspace/context.tar.gz");
    if !context_path.is_file() {
        log_step("Downloading context.");

        std::io::copy(
            &mut cluster.stream_artifact(&config.context_task_id, &config.context_path)?,
            &mut std::fs::File::create(context_path)?,
        )
        .context("Could not download image context.")?;
    } else {
        log_step(&format!(
            "Using existing context from {}",
            context_path.display()
        ));
    }

    if let Some(parent_task_id) = config.parent_task_id {
        let parent_path = Path::new("/workspace/parent.tar");
        let digest = if parent_path.is_file() {
            log_step(&format!(
                "Using existing parent image from {}",
                parent_path.display()
            ));
            read_image_digest(parent_path.to_str().unwrap())?
        } else {
            log_step("Downloading image.");
            download_parent_image(&cluster, &parent_task_id, parent_path.to_str().unwrap())?
        };

        log_step(&format!("Parent image digest {}", &digest));
        std::fs::create_dir_all("/workspace/cache")?;
        std::fs::copy(parent_path, format!("/workspace/cache/{}", digest))?;

        build_args.insert(
            "DOCKER_IMAGE_PARENT".into(),
            format!("parent:latest@{}", digest),
        );
    }

    log_step("Building image.");
    build_image(
        context_path.to_str().unwrap(),
        output_dir.join("image-pre.tar").to_str().unwrap(),
        config.debug,
        build_args,
    )?;
    if let Some(arch) = config.target_arch.as_deref() {
        log_step(&format!("Setting image architecture to {}", arch));
        set_image_architecture(&output_dir.join("image-pre.tar"), arch)?;
    }
    log_step("Repacking image.");
    repack_image(
        output_dir.join("image-pre.tar").to_str().unwrap(),
        output_dir.join("image.tar").to_str().unwrap(),
        &config.image_name,
    )?;

    log_step("Compressing image.");
    compress_file(
        output_dir.join("image.tar"),
        output_dir.join("image.tar.zst"),
        config.docker_image_zstd_level,
    )?;

    if let Some(owner) = config.chown_output {
        log_step(&format!("Changing ownership to {}", owner));
        chown_output_files(&owner, output_dir)?;
    }

    Ok(())
}

fn compress_file(
    source: impl AsRef<std::path::Path>,
    dest: impl AsRef<std::path::Path>,
    zstd_level: i32,
) -> Result<()> {
    Ok(zstd::stream::copy_encode(
        std::fs::File::open(source)?,
        std::fs::File::create(dest)?,
        zstd_level,
    )?)
}

fn chown_output_files(owner: &str, output_dir: &Path) -> Result<()> {
    let parts: Vec<&str> = owner.split(':').collect();
    ensure!(
        parts.len() == 2,
        "Owner must be in format 'uid:gid', got: {}",
        owner
    );

    let uid = parts[0]
        .parse::<u32>()
        .with_context(|| format!("Failed to parse uid: {}", parts[0]))?;
    let gid = parts[1]
        .parse::<u32>()
        .with_context(|| format!("Failed to parse gid: {}", parts[1]))?;

    for entry in std::fs::read_dir(output_dir)? {
        let entry = entry?;
        let path = entry.path();
        chown(&path, Some(uid), Some(gid))
            .with_context(|| format!("Failed to chown {}", path.display()))?;
    }

    Ok(())
}

#[cfg(test)]
mod test {
    use super::set_image_architecture;
    use std::io::Read;

    fn append(builder: &mut tar::Builder<Vec<u8>>, name: &str, data: &[u8]) {
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o644);
        builder.append_data(&mut header, name, data).unwrap();
    }

    fn read_entry(tar_path: &std::path::Path, name: &str) -> Vec<u8> {
        let mut archive = tar::Archive::new(std::fs::File::open(tar_path).unwrap());
        for entry in archive.entries().unwrap() {
            let mut entry = entry.unwrap();
            if entry.path().unwrap().to_str() == Some(name) {
                let mut buf = Vec::new();
                entry.read_to_end(&mut buf).unwrap();
                return buf;
            }
        }
        panic!("entry {} not found", name);
    }

    #[test]
    fn rewrites_architecture_and_preserves_other_entries() {
        let tar_path = std::env::temp_dir().join("build-image-set-arch-test.tar");
        let config = br#"{"architecture":"amd64","os":"linux","config":{}}"#;
        let layer = b"this is a fake layer blob";

        let mut builder = tar::Builder::new(Vec::new());
        append(&mut builder, "layer.tar", layer);
        append(&mut builder, "config.json", config);
        append(
            &mut builder,
            "manifest.json",
            br#"[{"Config":"config.json","RepoTags":null,"Layers":["layer.tar"]}]"#,
        );
        std::fs::write(&tar_path, builder.into_inner().unwrap()).unwrap();

        set_image_architecture(&tar_path, "arm64").unwrap();

        let new_config: serde_json::Value =
            serde_json::from_slice(&read_entry(&tar_path, "config.json")).unwrap();
        assert_eq!(new_config["architecture"], "arm64");
        assert_eq!(new_config["os"], "linux");
        // Unrelated entries are copied verbatim.
        assert_eq!(read_entry(&tar_path, "layer.tar"), layer);

        std::fs::remove_file(&tar_path).unwrap();
    }
}
