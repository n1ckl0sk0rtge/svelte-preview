plugins {
    java
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "dev.sveltepreview"
version = "0.1.6"

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

java {
    toolchain { languageVersion = JavaLanguageVersion.of(25) }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    intellijPlatform {
        intellijIdea("2026.3")
        bundledPlugin("com.intellij.modules.jcef")
        bundledPlugin("JavaScript")
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion { sinceBuild = "263" }
    }
}
