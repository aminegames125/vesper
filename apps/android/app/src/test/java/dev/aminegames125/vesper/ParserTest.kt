package dev.aminegames125.vesper

import dev.aminegames125.vesper.data.parser.M3uParser
import dev.aminegames125.vesper.data.parser.XtreamParser
import dev.aminegames125.vesper.recording.HlsPlaylist
import dev.aminegames125.vesper.recording.Playlist
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class M3uParserTest {
    @Test
    fun parsesAttributesAndTitle() {
        val text = "﻿#EXTM3U\r\n" +
            "#EXTINF:-1 tvg-id=\"news.1\" tvg-logo=\"http://x/l.png\" group-title=\"News\",News One\r\n" +
            "http://host/live/1.m3u8\r\n" +
            "#EXTINF:-1,Plain\r\nhttp://host/live/2.m3u8\r\n"
        val channels = M3uParser.parse(text, "s1")
        assertEquals(2, channels.size)
        assertEquals("News One", channels[0].name)
        assertEquals("News", channels[0].grp)
        assertEquals("http://x/l.png", channels[0].logo)
        assertEquals("news.1", channels[0].tvgId)
        assertEquals("Ungrouped", channels[1].grp)
        assertNull(channels[1].logo)
        assertEquals(2, channels.map { it.id }.toSet().size)
    }

    @Test
    fun ignoresOrphanUrlsAndComments() {
        val channels = M3uParser.parse("#EXTM3U\n#EXTVLCOPT:x\nhttp://a/1\n", "s")
        assertTrue(channels.isEmpty())
    }
}

class XtreamParserTest {
    private val json = Json

    @Test
    fun normalisesHost() {
        assertEquals("http://h.tv:8080", XtreamParser.host(" h.tv:8080/ "))
        assertEquals("https://h.tv", XtreamParser.host("https://h.tv//"))
    }

    @Test
    fun toleratesLooseTypes() {
        val streams = json.parseToJsonElement(
            """[{"stream_id":"7","name":"Film","category_id":3,"rating":"7.5","added":"1700000000"},
                {"name":"no id"}]""",
        )
        val cats = json.parseToJsonElement("""[{"category_id":"3","category_name":"Drama"}]""")
        val movies = XtreamParser.movies("p", cats, streams)
        assertEquals(1, movies.size)
        assertEquals("Drama", movies[0].grp)
        assertEquals(7.5, movies[0].rating!!, 0.0)
        assertEquals("mp4", movies[0].extension)
    }

    @Test
    fun seriesEpisodesAcceptSeasonMapOrFlatList() {
        val map = json.parseToJsonElement(
            """{"info":{"plot":"p"},"episodes":{"2":[{"id":"22","episode_num":1,"title":"B"}],"1":[{"id":"11","episode_num":"2"},{"id":"10","episode_num":1}]}}""",
        )
        val (detail, episodes) = XtreamParser.show(map, "http://h", "u", "p")
        assertEquals("p", detail.plot)
        assertEquals(listOf("10", "11", "22"), episodes.map { it.id })
        assertEquals("http://h/series/u/p/10.mp4", episodes[0].url)

        val flat = json.parseToJsonElement("""{"episodes":[{"id":"1","episode_num":1}]}""")
        assertEquals(1, XtreamParser.show(flat, "http://h", "u", "p").second.size)
    }

    @Test
    fun rejectedLoginIsAnError() {
        val bad = json.parseToJsonElement("""{"user_info":{"auth":0}}""")
        assertFalse(runCatching { XtreamParser.account(bad) }.isSuccess)
        val good = json.parseToJsonElement("""{"user_info":{"auth":1,"status":"Active","max_connections":"2"}}""")
        assertEquals(2, XtreamParser.account(good).maxConnections)
    }
}

class HlsPlaylistTest {
    @Test
    fun picksTheBestVariantAndResolvesRelativeUrls() {
        val master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2400000\nhigh/index.m3u8\n"
        val parsed = HlsPlaylist.parse(master, "http://h/live/master.m3u8") as Playlist.Master
        assertEquals("http://h/live/high/index.m3u8", HlsPlaylist.best(parsed)!!.url)
    }

    @Test
    fun readsSequenceNumbersAndEnd() {
        val media = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:40\n#EXTINF:6.0,\na.ts\n#EXTINF:5.5,\nb.ts\n#EXT-X-ENDLIST\n"
        val parsed = HlsPlaylist.parse(media, "http://h/p/index.m3u8") as Playlist.Media
        assertEquals(listOf(40L, 41L), parsed.segments.map { it.sequence })
        assertEquals(5.5, parsed.segments[1].seconds, 0.0)
        assertEquals("http://h/p/a.ts", parsed.segments[0].url)
        assertTrue(parsed.ended)
        assertFalse(parsed.encrypted)
    }

    @Test
    fun flagsEncryptedStreams() {
        val media = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n#EXTINF:6,\na.ts\n"
        assertTrue((HlsPlaylist.parse(media, "http://h/i.m3u8") as Playlist.Media).encrypted)
    }
}
