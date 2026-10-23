import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

// Version follows the web app (package.json); CI passes a build number.
val webPackage = rootProject.file("../package.json").readText()
val webVersion = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(webPackage)?.groupValues?.get(1) ?: "1.0.0"
val buildNumber = (System.getenv("BUILD_NUMBER") ?: "1").toInt()

android {
    namespace = "com.tonykfr.talkbridge"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.tonykfr.talkbridge"
        minSdk = 26
        targetSdk = 36
        versionCode = buildNumber
        // CI builds are "1.3.1.<run>", matching the GitHub release tag the app checks for updates.
        versionName = if (System.getenv("BUILD_NUMBER") != null) "$webVersion.$buildNumber" else webVersion
    }

    // Release signing: keystore.properties locally (never committed), or the
    // ANDROID_KEYSTORE_* secrets in GitHub Actions.
    val keystoreFile = rootProject.file("keystore.properties")
    val props = if (keystoreFile.exists()) Properties().apply { keystoreFile.inputStream().use(::load) } else null
    val envStore = System.getenv("ANDROID_KEYSTORE_FILE")
    signingConfigs {
        if (props != null) create("upload") {
            storeFile = file(props.getProperty("storeFile"))
            storePassword = props.getProperty("storePassword")
            keyAlias = props.getProperty("keyAlias")
            keyPassword = props.getProperty("keyPassword")
        } else if (!envStore.isNullOrBlank()) create("upload") {
            storeFile = file(envStore)
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
    lint {
        abortOnError = true
        warningsAsErrors = false
        checkDependencies = false
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "ObsoleteSdkInt", "SetJavaScriptEnabled")
    }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

// The app ships the same web app as the site: copied from the repository root
// on every build, so a web fix is in the next APK automatically.
val copyWebAssets by tasks.registering(Copy::class) {
    from(rootProject.file("..")) {
        include("index.html", "donate.html", "donate.json", "donors.json", "CHANGELOG.md", "manifest.webmanifest", "css/**", "js/**", "assets/**")
    }
    into(layout.buildDirectory.dir("generated/webassets/www"))
}
tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    testImplementation(libs.junit)
}
