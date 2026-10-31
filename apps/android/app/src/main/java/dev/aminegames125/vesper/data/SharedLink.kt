package dev.aminegames125.vesper.data

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

private val client = OkHttpClient.Builder()
    .connectTimeout(6, TimeUnit.SECONDS)
    .readTimeout(8, TimeUnit.SECONDS)
    .build()

private val LOGO = Regex("""tvg-logo="([^"]*)"""")
private val GROUP = Regex("""group-title="([^"]*)"""")

/** Reads the channels of an M3U playlist. A stream playlist (HLS) has none and gives an empty list. */
fun parsePlaylistChannels(text: String, base: String, limit: Int = 200): List<Channel> {
    if (!text.trimStart().startsWith("#EXTM3U") || text.contains("#EXT-X-")) return emptyList()
    val found = mutableListOf<Channel>()
    var name: String? = null
    var logo = ""
    var group = ""
    for (raw in text.lineSequence()) {
        val line = raw.trim()
        when {
            line.startsWith("#EXTINF") -> {
                name = line.substringAfterLast(',', "").trim().ifEmpty { null }
                logo = LOGO.find(line)?.groupValues?.get(1).orEmpty()
                group = GROUP.find(line)?.groupValues?.get(1).orEmpty()
            }
            line.isEmpty() || line.startsWith("#") -> {}
            else -> {
                val url = base.toHttpUrlOrNull()?.resolve(line)?.toString() ?: line
                if (url.startsWith("http")) {
                    found += Channel(name = name ?: url.toHttpUrlOrNull()?.host.orEmpty(), url = url, group = group, logo = logo)
                    if (found.size >= limit) break
                }
                name = null
            }
        }
    }
    return found
}

/**
 * What a shared link holds: the channels when it is a playlist, otherwise the link itself as one
 * stream. A link that cannot be read is treated as a single stream too.
 */
suspend fun readSharedLink(url: String): List<Channel> = withContext(Dispatchers.IO) {
    val single = Channel(name = url.toHttpUrlOrNull()?.host ?: "Shared stream", url = url)
    val path = url.substringBefore('?').lowercase()
    if (path.endsWith(".mp4") || path.endsWith(".mkv") || path.endsWith(".ts")) return@withContext listOf(single)
    runCatching {
        client.newCall(Request.Builder().url(url).build()).execute().use { response ->
            val body = response.body ?: return@use listOf(single)
            val source = body.source()
            source.request(2_000_000)
            val text = source.buffer.clone().readUtf8()
            parsePlaylistChannels(text, response.request.url.toString()).ifEmpty { listOf(single) }
        }
    }.getOrDefault(listOf(single))
}
