/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

plugins {
    alias(libs.plugins.kotlin.dsl)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    implementation(libs.kaml)
}

group = "org.mozilla"

val mozconfig = gradle.extra["mozconfig"] as Map<*, *>
val topobjdir = mozconfig["topobjdir"] as String

layout.buildDirectory.set(file("$topobjdir/gradle/build/mobile/android/gradle/plugins/conventions"))

gradlePlugin {
    plugins.register("org.mozilla.conventions.settings") {
        id = "org.mozilla.conventions.settings"
        implementationClass = "org.mozilla.conventions.SettingsPlugin"
    }
    plugins.register("org.mozilla.conventions.project") {
        id = "org.mozilla.conventions.project"
        implementationClass = "org.mozilla.conventions.ProjectPlugin"
    }
    plugins.register("org.mozilla.conventions.mach-tasks") {
        id = "org.mozilla.conventions.mach-tasks"
        implementationClass = "org.mozilla.conventions.MachTasksPlugin"
    }
    plugins.register("org.mozilla.conventions.zip-test-reports") {
        id = "org.mozilla.conventions.zip-test-reports"
        implementationClass = "org.mozilla.conventions.ZipTestReportsPlugin"
    }
}

dependencies {
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
    useJUnitPlatform()
}
