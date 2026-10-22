package com.tonykfr.talkbridge

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Android's speech recognizer behind the page's SpeechRecognition shim. One
 * session at a time, like the browser; the page restarts sessions itself to
 * keep listening.
 */
class SpeechBridge(
    private val activity: MainActivity,
    private val emit: (Int, String, String) -> Unit,
) {
    private var recognizer: SpeechRecognizer? = null
    private var currentId = -1
    private var ended = true

    fun start(id: Int, lang: String, interim: Boolean) {
        finish() // only one session at a time
        currentId = id
        ended = false
        if (!activity.hasMic()) {
            activity.askMic()
            fail(id, "not-allowed")
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            fail(id, "service-not-allowed")
            return
        }
        val r = SpeechRecognizer.createSpeechRecognizer(activity)
        recognizer = r
        r.setRecognitionListener(Listener(id))
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, interim)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.packageName)
        r.startListening(intent)
    }

    fun stop(id: Int) {
        if (id == currentId) recognizer?.stopListening()
    }

    fun cancel(id: Int) {
        if (id != currentId) return
        recognizer?.cancel()
        end(id)
    }

    private fun fail(id: Int, error: String) {
        emit(id, "error", "{\"error\":${Util.jsString(error)}}")
        end(id)
    }

    private fun end(id: Int) {
        if (id != currentId || ended) return
        ended = true
        emit(id, "end", "{}")
        recognizer?.destroy()
        recognizer = null
    }

    private fun finish() {
        if (currentId >= 0) {
            recognizer?.cancel()
            end(currentId)
        }
    }

    fun shutdown() = finish()

    private inner class Listener(private val id: Int) : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = emit(id, "start", "{}")
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) = send(partialResults, false)

        override fun onResults(results: Bundle?) {
            send(results, true)
            end(id)
        }

        override fun onError(error: Int) {
            if (id != currentId || ended) return
            fail(id, Util.speechError(error))
        }

        private fun send(b: Bundle?, final: Boolean) {
            if (id != currentId) return
            val text = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            if (text.isEmpty()) return
            val conf = b?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull() ?: 0.8f
            emit(id, "result", "{\"text\":${Util.jsString(text)},\"final\":$final,\"confidence\":$conf}")
        }
    }
}
