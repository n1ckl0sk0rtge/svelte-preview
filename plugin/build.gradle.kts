import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType

plugins {
    java
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "dev.sveltepreview"
version = "1.0.0"

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
        pluginVerifier()
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion { sinceBuild = "263" }
    }

    // Check the build platform and WebStorm before distributing the plugin.
    pluginVerification {
        ides {
            current()
            create(IntelliJPlatformType.WebStorm, "2026.3")
        }
    }

    // Keep signing credentials outside the repository; unsigned builds still work locally.
    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }
}

// Ship the project license with the installed plugin.
tasks.processResources {
    from(rootProject.file("../LICENSE")) { into("META-INF") }
}
