package dev.aminegames125.vesper.recording

import java.net.URI

/** One media segment of an HLS playlist. */
data class Segment(val sequence: Long, val url: String, val seconds: Double)

/** A stream variant listed in a master playlist. */
data class Variant(val url: String, val bandwidth: Long)

sealed interface Playlist {
    data class Master(val variants: List<Variant>) : Playlist

    data class Media(
        val segments: List<Segment>,
        val ended: Boolean,
        val encrypted: Boolean,
    ) : Playlist
}

/** Reads HLS playlists, resolving every address against the playlist's own URL. */
object HlsPlaylist {
    fun parse(text: String, baseUrl: String): Playlist {
        val lines = text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
        if (lines.any { it.startsWith("#EXT-X-STREAM-INF") }) return parseMaster(lines, baseUrl)
        return parseMedia(lines, baseUrl)
    }

    private fun parseMaster(lines: List<String>, baseUrl: String): Playlist.Master {
        val variants = mutableListOf<Variant>()
        var bandwidth: Long? = null
        for (line in lines) {
            when {
                line.startsWith("#EXT-X-STREAM-INF") ->
                    bandwidth = Regex("""BANDWIDTH=(\d+)""").find(line)?.groupValues?.get(1)?.toLongOrNull() ?: 0
                !line.startsWith("#") && bandwidth != null -> {
                    variants += Variant(resolve(baseUrl, line), bandwidth)
                    bandwidth = null
                }
            }
        }
        return Playlist.Master(variants)
    }

    private fun parseMedia(lines: List<String>, baseUrl: String): Playlist.Media {
        var sequence = 0L
        var duration = 0.0
        var ended = false
        var encrypted = false
        val segments = mutableListOf<Segment>()
        for (line in lines) {
            when {
                line.startsWith("#EXT-X-MEDIA-SEQUENCE:") -> sequence = line.substringAfter(':').trim().toLongOrNull() ?: 0
                line.startsWith("#EXTINF:") -> duration = line.substringAfter(':').substringBefore(',').trim().toDoubleOrNull() ?: 0.0
                line.startsWith("#EXT-X-ENDLIST") -> ended = true
                line.startsWith("#EXT-X-KEY") && !line.contains("METHOD=NONE") -> encrypted = true
                !line.startsWith("#") -> {
                    segments += Segment(sequence, resolve(baseUrl, line), duration)
                    sequence++
                    duration = 0.0
                }
            }
        }
        return Playlist.Media(segments, ended, encrypted)
    }

    /** The highest-bandwidth variant, which is what a recording should keep. */
    fun best(master: Playlist.Master): Variant? = master.variants.maxByOrNull { it.bandwidth }

    fun resolve(base: String, ref: String): String =
        if (ref.startsWith("http://") || ref.startsWith("https://")) ref else URI(base).resolve(ref).toString()
}
