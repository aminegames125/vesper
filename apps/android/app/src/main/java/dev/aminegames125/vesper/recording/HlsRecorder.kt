package dev.aminegames125.vesper.recording

import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

data class Progress(val seconds: Double, val bytes: Long)

class RecordingException(message: String) : IOException(message)

/**
 * Records a live stream to a file, the same way the desktop recorder does: pick the best variant,
 * start at the live edge, and stop once the requested amount of stream time has been captured.
 * Streams that are not HLS are copied byte for byte for the same amount of wall time.
 */
class HlsRecorder(private val client: OkHttpClient) {

    suspend fun record(
        url: String,
        out: File,
        maxSeconds: Int,
        onProgress: suspend (Progress) -> Unit = {},
    ): Progress = withContext(Dispatchers.IO) {
        val first = fetchText(url)
        if (first == null) copyRaw(url, out, maxSeconds, onProgress) else recordHls(url, first, out, maxSeconds, onProgress)
    }

    private suspend fun recordHls(
        url: String,
        firstText: String,
        out: File,
        maxSeconds: Int,
        onProgress: suspend (Progress) -> Unit,
    ): Progress {
        var mediaUrl = url
        var text = firstText
        val parsed = HlsPlaylist.parse(text, url)
        if (parsed is Playlist.Master) {
            val best = HlsPlaylist.best(parsed) ?: throw RecordingException("The playlist lists no streams.")
            mediaUrl = best.url
            text = fetchText(mediaUrl) ?: throw RecordingException("Could not read the stream playlist.")
        }

        var captured = 0.0
        var bytes = 0L
        var lastSequence = -1L
        var firstPass = true
        var emptyRounds = 0

        out.parentFile?.mkdirs()
        out.outputStream().buffered().use { sink ->
            while (captured < maxSeconds) {
                currentCoroutineContext().ensureActive()
                val playlist = HlsPlaylist.parse(text, mediaUrl) as? Playlist.Media
                    ?: throw RecordingException("Unexpected playlist.")
                if (playlist.encrypted) throw RecordingException("This stream is encrypted and cannot be recorded.")

                var fresh = playlist.segments.filter { it.sequence > lastSequence }
                // A live playlist holds a backlog; start at its edge so the recording begins now.
                if (firstPass && !playlist.ended && fresh.size > 2) fresh = fresh.takeLast(2)
                firstPass = false

                for (segment in fresh) {
                    if (captured >= maxSeconds) break
                    currentCoroutineContext().ensureActive()
                    val data = fetchBytes(segment.url)
                    sink.write(data)
                    bytes += data.size
                    captured += segment.seconds
                    lastSequence = segment.sequence
                    onProgress(Progress(captured, bytes))
                }

                if (playlist.ended && fresh.isEmpty()) break
                emptyRounds = if (fresh.isEmpty()) emptyRounds + 1 else 0
                if (emptyRounds > 30) throw RecordingException("The stream stopped sending data.")
                if (captured >= maxSeconds) break
                delay(if (fresh.isEmpty()) 1_000 else 500)
                text = fetchText(mediaUrl) ?: throw RecordingException("Lost the stream playlist.")
            }
        }
        return Progress(captured, bytes)
    }

    private suspend fun copyRaw(url: String, out: File, maxSeconds: Int, onProgress: suspend (Progress) -> Unit): Progress {
        val started = System.nanoTime()
        var bytes = 0L
        out.parentFile?.mkdirs()
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) throw RecordingException("The server answered ${response.code}.")
            val body = response.body ?: throw RecordingException("Empty response.")
            out.outputStream().buffered().use { sink ->
                val buffer = ByteArray(64 * 1024)
                val source = body.byteStream()
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val seconds = (System.nanoTime() - started) / 1e9
                    if (seconds >= maxSeconds) break
                    val n = source.read(buffer)
                    if (n < 0) break
                    sink.write(buffer, 0, n)
                    bytes += n
                    onProgress(Progress(seconds, bytes))
                }
            }
        }
        return Progress((System.nanoTime() - started) / 1e9, bytes)
    }

    /** The playlist text, or null when the address is not a playlist at all (a raw stream). */
    private fun fetchText(url: String): String? {
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) throw RecordingException("The server answered ${response.code}.")
            val type = response.header("Content-Type").orEmpty().lowercase()
            val body = response.body ?: return null
            // Do not buffer a never-ending raw stream: only read what looks like a playlist.
            val looksHls = url.substringBefore('?').endsWith(".m3u8") ||
                type.contains("mpegurl") || type.contains("m3u")
            if (!looksHls) return null
            return body.string().takeIf { it.trimStart().startsWith("#EXTM3U") }
        }
    }

    private fun fetchBytes(url: String): ByteArray =
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            if (!response.isSuccessful) throw RecordingException("A segment failed with ${response.code}.")
            response.body?.bytes() ?: ByteArray(0)
        }
}
