import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

val vtApiKey: String =
    (findProperty("VIRUSTOTAL_API_KEY") as String?)
        ?: System.getenv("VIRUSTOTAL_API_KEY")
        ?: ""

// Base64 X.509 SubjectPublicKeyInfo (ECDSA P-256) used to verify signed threat
// feeds. Blank => feed signatures are optional (unsigned feeds accepted).
val feedPublicKey: String =
    (findProperty("FEED_PUBLIC_KEY") as String?)
        ?: System.getenv("FEED_PUBLIC_KEY")
        ?: ""

// Release signing keys are read from environment variables first, then from
// local.properties (git-ignored), so both CI and local builds work.
val localProperties = Properties()
rootProject.file("local.properties")
    .takeIf { it.exists() }
    ?.inputStream()
    ?.use { localProperties.load(it) }

fun signingValue(key: String): String =
    System.getenv(key) ?: localProperties.getProperty(key) ?: ""

// APK file name → zap-scanware-<variant>.apk
base {
    archivesName.set("zap-scanware")
}

android {
    namespace = "com.malwareshield"
    compileSdk = 34

    signingConfigs {
        create("release") {
            storeFile = file(signingValue("KEYSTORE_PATH").ifBlank { "release-key.jks" })
            storePassword = signingValue("KEYSTORE_PASSWORD")
            keyAlias = signingValue("KEY_ALIAS")
            keyPassword = signingValue("KEY_PASSWORD")
        }
    }

    defaultConfig {
        applicationId = "com.zapscanware"
        minSdk = 26
        targetSdk = 34
        versionCode = 49
        versionName = "1.37.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "VIRUSTOTAL_API_KEY", "\"$vtApiKey\"")
        buildConfigField("String", "FEED_PUBLIC_KEY", "\"$feedPublicKey\"")
    }

    lint {
        disable += listOf("QueryPermissionsNeedAppAccess", "HardcodedDebugMode")
        checkReleaseBuilds = false
        abortOnError = false
    }

    testOptions {
        animationsDisabled = true
    }

    buildTypes {
        named("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            isDebuggable = false
            signingConfig = signingConfigs["release"]
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        named("debug") {
            isDebuggable = true
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.7"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

tasks.withType<Test> {
    testLogging {
        events("passed", "failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions {
        freeCompilerArgs += "-Xjsr305=strict"
    }
}

kapt {
    correctErrorTypes = true
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.01.00")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    // Pin material3 to 1.2.0 so it matches compose-animation/ui 1.6.0 from the
    // BOM. A mismatched material3 (1.1.2) + animation-core (1.6.0) crashes
    // CircularProgressIndicator with NoSuchMethodError(KeyframesSpecConfig.at).
    implementation("androidx.compose.material3:material3:1.2.0")
    implementation("androidx.compose.material:material-icons-extended")
    // NOTE (v1.19.0 cleanup): navigation-compose, hilt-navigation-compose,
    // ui-toolting-preview, lifecycle-viewmodel-compose and lifecycle-runtime-compose
    // were removed — navigation is a manual Screen enum, ViewModels are provided
    // via Hilt @HiltViewModel + by viewModels(), and no @Preview exists.

    implementation("com.google.dagger:hilt-android:2.50")
    ksp("com.google.dagger:hilt-compiler:2.50")

    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")

    implementation("androidx.work:work-runtime-ktx:2.9.0")

    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Referenced unconditionally by the API clients; must be on the release
    // classpath too (logging level is gated by BuildConfig.DEBUG at runtime).
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.7.0")
    // LiveData <-> Compose bridge for HistoryScreen.
    implementation("androidx.compose.runtime:runtime-livedata")

    implementation("androidx.datastore:datastore-preferences:1.0.0")

    // Biometric Authentication
    implementation("androidx.biometric:biometric:1.2.0-alpha04")

    // Core library desugaring for Java 8+ features in test libraries
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")

    // NOTE (v1.19.0 cleanup): mockito-core, kotlinx-coroutines-test and truth
    // were removed — the 20+ unit tests use plain JUnit4 asserts. The
    // androidTest/espresso/ui-test entries were removed too: app/src/androidTest
    // does not exist.
    testImplementation("junit:junit:4.13.2")

    // Instrumented tests (v1.22.0: restored for production readiness)
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:truth:1.5.0")
    androidTestImplementation("androidx.test:core:1.5.0")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test:rules:1.5.0")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}