package com.tonykfr.talkbridge

import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import org.json.JSONArray
import java.io.File

/** Saving exports to Downloads and sharing them (LINE and other apps). */
class FileBridge(private val activity: MainActivity) {

    /** Saves to Downloads/TalkBridge. Returns a message for the page. */
    fun save(name: String, mime: String, base64: String): String {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val safe = Util.safeFileName(name)
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TalkBridge")
                }
                val uri = activity.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: return "存檔失敗：無法建立檔案"
                activity.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                "已存到「下載／TalkBridge」：$safe"
            } else {
                val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: activity.filesDir
                File(dir, safe).writeBytes(bytes)
                "已存到 ${dir.absolutePath}/$safe"
            }
        } catch (e: Exception) {
            "存檔失敗：${e.message}"
        }
    }

    /** Opens the Android share sheet with the given files and text. */
    fun share(title: String, text: String, filesJson: String) {
        val dir = File(activity.cacheDir, ShareProvider.DIR).apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val uris = ArrayList<Uri>()
        var mime: String? = null
        val arr = JSONArray(filesJson)
        for (i in 0 until arr.length()) {
            val f = arr.getJSONObject(i)
            val name = Util.safeFileName(f.getString("name"))
            File(dir, name).writeBytes(Base64.decode(f.getString("data"), Base64.DEFAULT))
            uris.add(ShareProvider.uriFor(activity, name))
            val m = f.optString("mime", "application/octet-stream")
            mime = if (mime == null || mime == m) m else "*/*"
        }
        val intent = when {
            uris.isEmpty() -> Intent(Intent.ACTION_SEND).setType("text/plain")
            uris.size == 1 -> Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uris[0])
            else -> Intent(Intent.ACTION_SEND_MULTIPLE).setType(mime).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        }
        if (text.isNotEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text)
        if (title.isNotEmpty()) intent.putExtra(Intent.EXTRA_SUBJECT, title)
        if (uris.isNotEmpty()) {
            val clip = ClipData.newRawUri(title, uris[0])
            for (u in uris.drop(1)) clip.addItem(ClipData.Item(u))
            intent.clipData = clip
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(intent, title.ifEmpty { "分享" }))
    }
}
