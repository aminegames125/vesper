package dev.aminegames125.vesper.cast

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

/** One picture quality of an HLS stream. [height] is 0 when the playlist does not say. */
data class Variant(val url: String, val height: Int, val bandwidth: Int)

private val RESOLUTION = Regex("""RESOLUTION=(\d+)x(\d+)""")
private val BANDWIDTH = Regex("""BANDWIDTH=(\d+)""")

/** Reads the qualities listed by an HLS master playlist. [base] turns relative links into full ones. */
fun parseVariants(text: String, base: String): List<Variant> {
    if (!text.trimStart().startsWith("#EXTM3U")) return emptyList()
    val lines = text.lines().map { it.trim() }
    val found = mutableListOf<Variant>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        if (line.startsWith("#EXT-X-STREAM-INF:")) {
            var j = i + 1
            while (j < lines.size && (lines[j].isEmpty() || lines[j].startsWith("#"))) j++
            if (j < lines.size) {
                val height = RESOLUTION.find(line)?.groupValues?.get(2)?.toIntOrNull() ?: 0
                val bandwidth = BANDWIDTH.find(line)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                val link = base.toHttpUrlOrNull()?.resolve(lines[j])?.toString() ?: lines[j]
                found += Variant(link, height, bandwidth)
            }
            i = j
        }
        i++
    }
    return found
}

/** The best quality that is not taller than [maxHeight]; the smallest one if all are taller. */
fun pickVariant(variants: List<Variant>, maxHeight: Int): Variant? {
    val known = variants.filter { it.height > 0 }
    return known.filter { it.height <= maxHeight }.maxWithOrNull(compareBy({ it.height }, { it.bandwidth }))
        ?: known.minByOrNull { it.height }
}

/** The distinct picture heights on offer, tallest first. */
fun heightsOf(variants: List<Variant>): List<Int> =
    variants.map { it.height }.filter { it > 0 }.distinct().sortedDescending()

private val client = OkHttpClient.Builder()
    .connectTimeout(6, TimeUnit.SECONDS)
    .readTimeout(8, TimeUnit.SECONDS)
    .build()

/** Looks at the stream's playlist and lists its qualities; empty when it offers only one. */
suspend fun fetchVariants(url: String): List<Variant> = withContext(Dispatchers.IO) {
    val path = url.substringBefore('?').lowercase()
    // Only an HLS playlist has qualities to list. Anything else (a raw live stream above all) must
    // not be opened here: IPTV accounts often allow one connection, and this would steal it from
    // the player.
    if (!path.endsWith(".m3u8")) return@withContext emptyList()
    runCatching {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@use emptyList()
            val body = response.body ?: return@use emptyList()
            val source = body.source()
            source.request(200_000)
            val text = source.buffer.clone().readUtf8()
            parseVariants(text, response.request.url.toString())
        }
    }.getOrDefault(emptyList())
}

/** "1080p" for a height, "Auto" for 0. */
fun qualityLabel(height: Int): String = if (height <= 0) "Auto (follows your connection)" else "${height}p"
