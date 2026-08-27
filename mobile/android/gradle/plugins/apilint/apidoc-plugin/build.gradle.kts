/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

plugins {
    java
    alias(libs.plugins.spotless)
}

val mozconfig = gradle.extra["mozconfig"] as Map<*, *>
val topobjdir = mozconfig["topobjdir"] as String

layout.buildDirectory.set(
    file("$topobjdir/gradle/build/mobile/android/gradle/plugins/apilint/apidoc-plugin"),
)

val javadocExecutable = "${System.getProperty("java.home")}/bin/javadoc"

// `mach gradle` passes the interpreter it is running under; prefer it over a bare `python3`.
// Keep the name in step with PythonExec.MACH_PYTHON_ENV_VAR.
val pythonCommand = providers.environmentVariable("GRADLE_MACH_PYTHON").getOrElse("python3")

val testApiDoclet = tasks.register<Exec>("testApiDoclet") {
    val jarTask = tasks.named<Jar>("jar")
    val docletJar = jarTask.flatMap { it.archiveFile }
    // The doclet generates the API into this directory for the script to compare against the expected
    // output, so it is the task's real output rather than scratch space.
    val outputDir = layout.buildDirectory.dir("python-tests/testApiDoclet")
    dependsOn(jarTask)

    inputs.file(docletJar)
        .withPropertyName("docletJar")
        .withPathSensitivity(PathSensitivity.RELATIVE)
    // Excluding the bytecode caches keeps an ignored build artifact from invalidating the suite, the
    // same way the apilint project's suites do.
    inputs.files(fileTree("src/test") { exclude("**/__pycache__/**") })
        .withPropertyName("testFixtures")
        .withPathSensitivity(PathSensitivity.RELATIVE)
    outputs.dir(outputDir)

    workingDir(".")
    commandLine(
        pythonCommand, file("src/test/resources/apidoc_test.py"),
        "--javadoc", javadocExecutable,
        "--doclet-jar", docletJar.get().asFile.absolutePath,
        "--java-root", file("src/test/fake_root"),
        "--out-dir", outputDir.get().asFile,
        "--expected", file("src/test/resources/expected-doclet-output.txt"),
        "--expected-map", file("src/test/resources/expected-map-output.txt"),
    )
}

tasks.named<Test>("test") {
    dependsOn(testApiDoclet)
    dependsOn("spotlessCheck")
}

spotless {
    lineEndings = com.diffplug.spotless.LineEnding.UNIX
    java {
        googleJavaFormat(libs.versions.google.java.format.get())
    }
}

configurations.create("docletJar")

artifacts {
    add("docletJar", tasks.named<Jar>("jar"))
}
