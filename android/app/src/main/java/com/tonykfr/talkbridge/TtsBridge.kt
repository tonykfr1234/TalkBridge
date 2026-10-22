package com.tonykfr.talkbridge

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/** Android text-to-speech behind the page's speechSynthesis shim. */
class TtsBridge(
    activity: MainActivity,
    private val emit: (Int, String, String) -> Unit,
) {
    private var ready = false
    private var pending: (() -> Unit)? = null
    private val tts: TextToSpeech = TextToSpeech(activity) { status ->
        ready = status == TextToSpeech.SUCCESS
        pending?.invoke()
        pending = null
    }

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}

            override fun onDone(utteranceId: String?) {
                done(utteranceId, "end")
            }

            @Suppress("OVERRIDE_DEPRECATION") // still called by older TTS engines
            override fun onError(utteranceId: String?) {
                done(utteranceId, "error")
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                done(utteranceId, "error")
            }

            override fun onStop(utteranceId: String?, interrupted: Boolean) {
                done(utteranceId, "end")
            }
        })
    }

    private fun done(utteranceId: String?, type: String) {
        val id = utteranceId?.removePrefix("u")?.toIntOrNull() ?: return
        emit(id, type, "{}")
    }

    fun voicesJson(): String {
        if (!ready) return "[]"
        val list = try { tts.voices.orEmpty() } catch (_: Exception) { emptySet() }
        return Util.voicesJson(list.map { it.name to it.locale.toLanguageTag() })
    }

    fun speak(id: Int, text: String, lang: String, voiceName: String, rate: Float) {
        if (!ready) {
            pending = { speak(id, text, lang, voiceName, rate) }
            return
        }
        val voice = if (voiceName.isNotEmpty()) tts.voices?.firstOrNull { it.name == voiceName } else null
        if (voice != null) tts.voice = voice
        else if (lang.isNotEmpty()) tts.language = Locale.forLanguageTag(lang)
        tts.setSpeechRate(rate)
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u$id") != TextToSpeech.SUCCESS) emit(id, "error", "{}")
    }

    fun stop() {
        if (ready) tts.stop()
    }

    fun shutdown() = tts.shutdown()
}
