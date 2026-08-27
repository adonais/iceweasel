/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

plugins {
    `kotlin-dsl`
    alias(libs.plugins.spotless)
}

val mozconfig = gradle.extra["mozconfig"] as Map<*, *>
val topsrcdir = mozconfig["topsrcdir"] as String
val topobjdir = mozconfig["topobjdir"] as String

layout.buildDirectory.set(file("$topobjdir/gradle/build/mobile/android/gradle/plugins/apilint/apilint"))

spotless {
    lineEndings = com.diffplug.spotless.LineEnding.UNIX
    kotlin {
        ktlint(libs.versions.ktlint.get())
            .setEditorConfigPath("$topsrcdir/mobile/android/geckoview/.editorconfig")
    }
}

sourceSets {
    main {
        resources {
            output.dir(mapOf("builtBy" to "copyDocletJar"), layout.buildDirectory.dir("docletJar"))
        }
    }
}

gradlePlugin {
    plugins.register("apilintPlugin") {
        id = "org.mozilla.apilint"
        displayName = "API Lint plugin"
        description = "Tracks the API of an Android library and helps maintain backward compatibility."
        implementationClass = "org.mozilla.apilint.ApiLintPlugin"
    }
}

// `mach gradle` passes the interpreter it is running under; prefer it over a bare `python3`, which
// is not necessarily on PATH. Keep the name in step with PythonExec.MACH_PYTHON_ENV_VAR.
val pythonCommand = providers.environmentVariable("GRADLE_MACH_PYTHON").getOrElse("python3")

// Every suite exercises the scripts in `src/main/resources`, driven by the fixtures in
// `src/test/resources` plus, for the integration suite, one from the sibling apidoc-plugin project.
// A task with inputs but no outputs is never up to date, so each suite gets a private output
// directory: whatever it writes goes there, and an empty one is enough for Gradle to snapshot.
fun pythonTestDir(name: String) = layout.buildDirectory.dir("python-tests/$name")

fun registerPythonTest(
    name: String,
    args: List<Any>,
    extraInputs: Any = files(),
    outputDirFlag: String? = null,
) =
    tasks.register<Exec>(name) {
        // The suites import the scripts under test, so Python writes bytecode caches next to them.
        // Those are ignored build artifacts, and snapshotting them costs an extra re-run of every
        // suite after any script change.
        inputs.files(
            fileTree("src/main/resources") { exclude("**/__pycache__/**") },
            fileTree("src/test/resources") { exclude("**/__pycache__/**") },
        ).withPropertyName("scripts").withPathSensitivity(PathSensitivity.RELATIVE)
        inputs.files(extraInputs)
            .withPropertyName("extraInputs")
            .withPathSensitivity(PathSensitivity.RELATIVE)
        val outputDir = pythonTestDir(name)
        outputs.dir(outputDir)

        workingDir(".")
        commandLine(listOf(pythonCommand) + args)
        // A suite that writes results is handed the directory declared as its output, so the two
        // cannot drift apart if the build directory is ever relocated.
        outputDirFlag?.let { flag -> doFirst { args(flag, outputDir.get().asFile) } }
    }

val expectedDocletOutput = "../apidoc-plugin/src/test/resources/expected-doclet-output.txt"

val pythonTests = listOf(
    registerPythonTest(
        "testApiLint",
        listOf("src/test/resources/apilint_test.py"),
        outputDirFlag = "--build-dir",
    ),
    registerPythonTest("unittestApiLint", listOf("src/test/resources/apilint_unittest.py")),
    registerPythonTest("testChangelogCheck", listOf("src/test/resources/changelog-check_test.py")),
    registerPythonTest("testDiff", listOf("src/test/resources/diff_test.py")),
    // Tests that the expected doclet result is understood by apilint.py
    registerPythonTest(
        "integrationTestApiLint",
        listOf("src/main/resources/apilint.py", expectedDocletOutput, expectedDocletOutput),
        extraInputs = files(expectedDocletOutput),
    ),
)

tasks.named<Test>("test") {
    useJUnitPlatform()

    dependsOn("spotlessCheck")
    dependsOn(pythonTests)
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

// Arrange for the doclet jar to be included in Java resources, to be consumed
// at runtime.
val docletJar = configurations.create("docletJar")

dependencies {
    compileOnly(libs.android.gradle.plugin)
    docletJar(project(path = ":apidoc-plugin", configuration = "docletJar"))

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.register<Sync>("copyDocletJar") {
    from(configurations.named("docletJar"))
    into(layout.buildDirectory.dir("docletJar"))
}
