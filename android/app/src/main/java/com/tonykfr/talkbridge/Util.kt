package com.tonykfr.talkbridge

/** Pure helpers shared by the bridge classes; covered by JVM unit tests. */
object Util {
    /** JavaScript string literal for evaluateJavascript. */
    fun jsString(s: String): String {
        val b = StringBuilder(s.length + 2).append('"')
        for (c in s) {
            when (c) {
                '"' -> b.append("\\\"")
                '\\' -> b.append("\\\\")
                '\n' -> b.append("\\n")
                '\r' -> b.append("\\r")
                '\t' -> b.append("\\t")
                ' ' -> b.append("\\u2028")
                ' ' -> b.append("\\u2029")
                else -> if (c < ' ') b.append(String.format("\\u%04x", c.code)) else b.append(c)
            }
        }
        return b.append('"').toString()
    }

    /** Web Speech API error name for an android.speech.SpeechRecognizer error code. */
    fun speechError(code: Int): String = when (code) {
        6, 7 -> "no-speech"                  // SPEECH_TIMEOUT, NO_MATCH
        9 -> "not-allowed"                   // INSUFFICIENT_PERMISSIONS
        1, 2, 4 -> "network"                 // NETWORK_TIMEOUT, NETWORK, SERVER
        3 -> "audio-capture"                 // AUDIO
        12, 13 -> "language-not-supported"   // LANGUAGE_NOT_SUPPORTED, LANGUAGE_UNAVAILABLE
        else -> "aborted"                    // CLIENT, RECOGNIZER_BUSY, others
    }

    /** File name safe for MediaStore and content URIs. */
    fun safeFileName(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trim().trimStart('.')
        return cleaned.ifEmpty { "TalkBridge" }.take(120)
    }

    private val MIME = mapOf(
        "html" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript", "css" to "text/css",
        "json" to "application/json", "webmanifest" to "application/manifest+json", "png" to "image/png",
        "svg" to "image/svg+xml", "ico" to "image/x-icon", "txt" to "text/plain", "md" to "text/markdown",
        "srt" to "application/x-subrip", "webm" to "audio/webm", "m4a" to "audio/mp4", "ogg" to "audio/ogg",
        "wav" to "audio/wav", "mp3" to "audio/mpeg",
    )

    fun mimeFor(path: String): String = MIME[path.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"

    fun isTextMime(mime: String): Boolean =
        mime.startsWith("text/") || mime == "application/json" || mime == "application/manifest+json" || mime == "image/svg+xml"

    /** JSON array of {name, lang} for the speech-synthesis shim. */
    fun voicesJson(voices: List<Pair<String, String>>): String =
        voices.joinToString(",", "[", "]") { (name, lang) -> "{\"name\":${jsString(name)},\"lang\":${jsString(lang)}}" }

    /** Asset path inside the APK for an app URL path, or null when outside the app. */
    fun assetPath(urlPath: String?): String? {
        val p = urlPath ?: return null
        if (!p.startsWith("/www/") || p.contains("..")) return null
        return p.removePrefix("/").ifEmpty { null }
    }
}
