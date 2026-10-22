package com.tonykfr.talkbridge

import android.view.WindowManager
import android.webkit.JavascriptInterface

/**
 * Object exposed to the page as `TalkBridgeAndroid` (see js/android.js).
 * JavaScript calls arrive on a background thread; work is moved to the main
 * thread, and results go back through window.__tbAndroid.event(id, type, json).
 */
class NativeBridge(private val activity: MainActivity) {
    private val speech = SpeechBridge(activity, ::emit)
    private val tts = TtsBridge(activity, ::emit)
    private val files = FileBridge(activity)

    fun emit(id: Int, type: String, json: String = "{}") {
        val js = "window.__tbAndroid && window.__tbAndroid.event($id, ${Util.jsString(type)}, ${Util.jsString(json)})"
        activity.runOnUiThread { if (!activity.isDestroyed) activity.web.evaluateJavascript(js, null) }
    }

    @JavascriptInterface
    fun versionName(): String =
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "0"

    @JavascriptInterface
    fun startRecognition(id: Int, lang: String, interim: Boolean) = activity.runOnUiThread { speech.start(id, lang, interim) }

    @JavascriptInterface
    fun stopRecognition(id: Int) = activity.runOnUiThread { speech.stop(id) }

    @JavascriptInterface
    fun cancelRecognition(id: Int) = activity.runOnUiThread { speech.cancel(id) }

    @JavascriptInterface
    fun voices(): String = tts.voicesJson()

    @JavascriptInterface
    fun speak(id: Int, text: String, lang: String, voiceName: String, rate: Double) =
        activity.runOnUiThread { tts.speak(id, text, lang, voiceName, rate.toFloat()) }

    @JavascriptInterface
    fun stopSpeaking() = activity.runOnUiThread { tts.stop() }

    @JavascriptInterface
    fun saveFile(name: String, mime: String, base64: String): String = files.save(name, mime, base64)

    @JavascriptInterface
    fun share(title: String, text: String, filesJson: String) = activity.runOnUiThread { files.share(title, text, filesJson) }

    @JavascriptInterface
    fun keepAwake(on: Boolean) = activity.runOnUiThread {
        if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    @JavascriptInterface
    fun openExternal(url: String) = activity.runOnUiThread { activity.openExternal(url) }

    fun shutdown() {
        speech.shutdown()
        tts.shutdown()
    }
}
