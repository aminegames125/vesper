# kotlinx.serialization keeps its generated serializers.
-keepattributes *Annotation*, InnerClasses, Signature
-keep,includedescriptorclasses class dev.aminegames125.vesper.**$$serializer { *; }
-keepclassmembers class dev.aminegames125.vesper.** { *** Companion; }
-keepclasseswithmembers class dev.aminegames125.vesper.** { kotlinx.serialization.KSerializer serializer(...); }
-dontwarn org.conscrypt.**
