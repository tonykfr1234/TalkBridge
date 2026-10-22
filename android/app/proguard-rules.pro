# Methods called from JavaScript through addJavascriptInterface.
-keepclassmembers class com.tonykfr.talkbridge.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
