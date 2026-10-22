package com.tonykfr.talkbridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UtilTest {
    @Test
    fun jsStringEscapesEverythingJavaScriptCares() {
        assertEquals("\"a\\\"b\\\\c\\nd\"", Util.jsString("a\"b\\c\nd"))
        assertEquals("\"\\u2028\\u0001\"", Util.jsString(" \u0001"))
        assertEquals("\"中文 OK\"", Util.jsString("中文 OK"))
    }

    @Test
    fun speechErrorsMapToWebSpeechNames() {
        assertEquals("no-speech", Util.speechError(7))
        assertEquals("no-speech", Util.speechError(6))
        assertEquals("not-allowed", Util.speechError(9))
        assertEquals("network", Util.speechError(2))
        assertEquals("audio-capture", Util.speechError(3))
        assertEquals("language-not-supported", Util.speechError(12))
        assertEquals("aborted", Util.speechError(8))
    }

    @Test
    fun fileNamesAreSafe() {
        assertEquals("TalkBridge_20261022-1430_minutes.md", Util.safeFileName("TalkBridge_20261022-1430_minutes.md"))
        assertEquals("a_b_c.txt", Util.safeFileName("a/b\\c.txt"))
        assertEquals("passwd", Util.safeFileName("../passwd").removePrefix("_"))
        assertEquals("TalkBridge", Util.safeFileName("   "))
        assertEquals(120, Util.safeFileName("x".repeat(300)).length)
    }

    @Test
    fun mimeTypesForTheWebApp() {
        assertEquals("text/javascript", Util.mimeFor("www/js/app.js"))
        assertEquals("text/html", Util.mimeFor("www/index.html"))
        assertEquals("image/png", Util.mimeFor("www/assets/icon-192.png"))
        assertEquals("audio/webm", Util.mimeFor("x_audio.webm"))
        assertEquals("application/octet-stream", Util.mimeFor("noext"))
        assertTrue(Util.isTextMime("text/css"))
        assertFalse(Util.isTextMime("image/png"))
    }

    @Test
    fun assetPathsStayInsideTheApp() {
        assertEquals("www/index.html", Util.assetPath("/www/index.html"))
        assertEquals("www/js/views/talk.js", Util.assetPath("/www/js/views/talk.js"))
        assertNull(Util.assetPath("/www/../secret"))
        assertNull(Util.assetPath("/other/index.html"))
        assertNull(Util.assetPath(null))
    }

    @Test
    fun voicesJsonIsValidJson() {
        assertEquals("[{\"name\":\"cmn-tw-x\",\"lang\":\"zh-TW\"},{\"name\":\"a\\\"b\",\"lang\":\"en-US\"}]",
            Util.voicesJson(listOf("cmn-tw-x" to "zh-TW", "a\"b" to "en-US")))
        assertEquals("[]", Util.voicesJson(emptyList()))
    }
}
