/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

plugins {
    `kotlin-dsl`
}

val mozconfig = gradle.extra["mozconfig"] as Map<*, *>
val topobjdir = mozconfig["topobjdir"] as String

layout.buildDirectory.set(
    file("$topobjdir/gradle/build/mobile/android/gradle/plugins/nimbus-gradle-plugin"),
)

gradlePlugin {
    plugins.register("org.mozilla.nimbus-gradle-plugin") {
        id = "org.mozilla.nimbus-gradle-plugin"
        implementationClass = "org.mozilla.appservices.tooling.nimbus.NimbusPlugin"
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

dependencies {
    compileOnly("org.mozilla:conventions")
    compileOnly(libs.android.gradle.plugin)
}
