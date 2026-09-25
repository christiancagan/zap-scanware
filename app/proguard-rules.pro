# Production ProGuard/R8 rules — targeted keeps only. The previous
# `-keep class com.malwareshield.** { *; }` disabled shrinking and
# obfuscation for the entire app; do not restore it.

# Keep Retrofit service signatures for reflective proxy generation.
-keep,allowshrinking,allowobfuscation interface com.malwareshield.core.network.VirusTotalApiService

# Keep Gson models (fields accessed reflectively).
-keepclassmembers,allowshrinking,allowobfuscation class com.malwareshield.core.network.** {
    <fields>;
}

# Keep persisted per-app scan-audit and hash-index DTOs (Gson field names).
-keepclassmembers,allowshrinking,allowobfuscation class com.malwareshield.core.security.AppScan* { <fields>; }
-keepclassmembers,allowshrinking,allowobfuscation class com.malwareshield.core.security.HashIndex* { <fields>; }
-keepclassmembers,allowshrinking,allowobfuscation class com.malwareshield.core.reputation.MalwareBazaarNegativeCache* { <fields>; }

# Room: keep entities/DAOs and their schemas.
-keep,allowshrinking,allowobfuscation class com.malwareshield.data.entities.** { *; }
-keep,allowshrinking,allowobfuscation interface com.malwareshield.data.dao.** { *; }
-keep class androidx.room.** { *; }
-dontwarn androidx.room.**

# Hilt/Dagger: keep generated components and entry points.
-keep class dagger.hilt.** { *; }
-keep class com.malwareshield.Hilt_** { *; }
-keep class com.malwareshield.**_HiltModules* { *; }
-keep class javax.inject.** { *; }
-dontwarn javax.annotation.**

# Coroutines / WorkManager.
-dontwarn kotlinx.coroutines.**
-keep class androidx.work.** { *; }

-keepattributes Signature,RuntimeVisibleAnnotations,EnclosingMethod,InnerClasses
