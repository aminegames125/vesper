package dev.aminegames125.vesper.data

import dev.aminegames125.vesper.cast.castUrlFor
import dev.aminegames125.vesper.cast.heightsOf
import dev.aminegames125.vesper.cast.parseVariants
import dev.aminegames125.vesper.cast.pickVariant
import dev.aminegames125.vesper.cast.isLocalOnly
import dev.aminegames125.vesper.cast.mimeFor
import dev.aminegames125.vesper.ui.playbackCandidates
import java.time.LocalTime
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeaturesTest {
    @Test
    fun aChromecastIsToldWhatKindOfStreamItIs() {
        assertEquals("application/x-mpegURL", mimeFor("http://h/live/a/b/1.m3u8?x=1"))
        assertEquals("video/mp4", mimeFor("http://h/movie/1.mp4"))
        assertEquals("video/mp2t", mimeFor("http://h/live/a/b/1.ts"))
        assertEquals("application/x-mpegURL", mimeFor("http://h/stream/channel"))
    }

    @Test
    fun aRawTsXtreamLinkIsOfferedAsHlsToTheTv() {
        assertEquals("http://h:80/live/u/p/42.m3u8", castUrlFor("http://h:80/live/u/p/42.ts"))
        assertEquals("http://h/live/u/p/42.m3u8?token=1", castUrlFor("http://h/live/u/p/42.ts?token=1"))
        assertEquals("http://h/other/42.ts", castUrlFor("http://h/other/42.ts"))
        assertEquals("http://h/live/u/p/42.m3u8", castUrlFor("http://h/live/u/p/42.m3u8"))
    }

    @Test
    fun anAddressThatOnlyMeansThisPhoneCannotBeCast() {
        assertTrue(isLocalOnly("http://localhost:8484/api"))
        assertTrue(isLocalOnly("http://127.0.0.1:8484/api"))
        assertTrue(isLocalOnly("http://10.0.2.2:8484/api"))
        assertFalse(isLocalOnly("http://192.168.1.20:8484/api"))
        assertFalse(isLocalOnly("http://nas.local:8484/api"))
    }

    @Test
    fun anAddressWithNoHintIsTriedAsHlsToo() {
        val tries = playbackCandidates("http://h/stream/1", listOf("http://h/backup.m3u8"))
        assertEquals(
            listOf(
                "http://h/stream/1" to null,
                "http://h/stream/1" to "application/x-mpegURL",
                "http://h/backup.m3u8" to null,
            ),
            tries,
        )
        assertEquals(listOf("http://h/a.mp4" to null), playbackCandidates("http://h/a.mp4", listOf("http://h/a.mp4")))
    }

    @Test
    fun theDeletionTimerIsDescribedInPlainWords() {
        assertNull(formatExpiry(null))
        assertEquals("Deleted in 6 d", formatExpiry(1_000_000 + 6 * 86_400 + 100, nowSeconds = 1_000_000))
        assertEquals("Deleted in 5 h", formatExpiry(1_000_000 + 5 * 3600 + 100, nowSeconds = 1_000_000))
        assertEquals("Deleted in 10 min", formatExpiry(1_000_000 + 600 + 10, nowSeconds = 1_000_000))
        assertEquals("Deleting soon", formatExpiry(999_999, nowSeconds = 1_000_000))
    }

    @Test
    fun positionsReadLikeAClock() {
        assertEquals("0:09", formatClock(9))
        assertEquals("5:09", formatClock(309))
        assertEquals("1:05:09", formatClock(3909))
        assertEquals("0:00", formatClock(-4))
    }

    @Test
    fun quietHoursMayRunPastMidnight() {
        assertTrue(withinQuietHours("22:00", "07:00", LocalTime.of(23, 30)))
        assertTrue(withinQuietHours("22:00", "07:00", LocalTime.of(3, 0)))
        assertFalse(withinQuietHours("22:00", "07:00", LocalTime.of(12, 0)))
        assertTrue(withinQuietHours("9:00", "17:00", LocalTime.of(10, 0)))
        assertFalse(withinQuietHours("", "", LocalTime.of(10, 0)))
        assertFalse(withinQuietHours("22:00", "22:00", LocalTime.of(22, 0)))
    }

    @Test
    fun aDownloadShowsHowFarItHasGot() {
        val running = Recording(id = "1", title = "Film", status = "recording", kind = "download", bytes = 250, totalBytes = 1000)
        assertEquals(0.25f, running.progress!!, 0.0001f)
        assertNull(running.copy(totalBytes = null).progress)
        assertNull(running.copy(status = "done").progress)
        assertNull(running.copy(kind = "recording").progress)
    }

    @Test
    fun theServersNewFieldsAreRead() {
        val json = """{"recordings":[{"id":"a","title":"T","status":"done","kind":"download","tag":"Films",
            "watched":true,"positionS":90,"thumb":true,"keepHours":168,"keepUntil":99,"totalBytes":5,"fileName":"file.mkv"}],
            "tags":["Films"],"storageUsed":1,"storageLimit":2}"""
        val list = AppJson.decodeFromString<RecordingList>(json)
        val r = list.recordings.single()
        assertTrue(r.isDownload && r.watched && r.thumb)
        assertEquals("Films", r.tag)
        assertEquals(90L, r.positionS)
        assertEquals("file.mkv", r.fileName)
        assertEquals(listOf("Films"), list.tags)
    }

    @Test
    fun aScheduleIsSentWithTheNewFields() {
        val text = AppJson.encodeToString(
            NewSchedule(
                title = "News", url = "http://h/1", tz = "UTC", startTime = "03:00", seconds = 600, startDate = "2026-01-01",
                keepHours = 0, backupUrl = "http://h/2", quality = "lowest", tag = "News", epgId = "a.id", followGuide = true,
            ),
        )
        assertTrue(text.contains("\"keep_hours\":0"))
        assertTrue(text.contains("\"backup_url\":\"http://h/2\""))
        assertTrue(text.contains("\"quality\":\"lowest\""))
        assertTrue(text.contains("\"follow_guide\":true"))
        assertTrue(text.contains("\"epg_id\":\"a.id\""))
    }

    @Test
    fun theKeepTimeChangeUsesTheServersName() = runBlocking {
        val server = MockWebServer()
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        server.start()
        val api = Api()
        api.base = server.url("/").toString().trimEnd('/')
        api.token = "t"
        api.setKeep("abc", 24)
        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/recordings/abc", request.path)
        assertEquals("""{"keep_hours":24}""", request.body.readUtf8())
        server.shutdown()
    }

    @Test
    fun theQualitiesOfAStreamAreRead() {
        val master = """#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
http://other/mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
high/index.m3u8"""
        val variants = parseVariants(master, "http://h/live/1.m3u8")
        assertEquals(listOf(1080, 720, 360), heightsOf(variants))
        assertEquals("http://h/live/low/index.m3u8", variants.first().url)
        assertEquals("http://other/mid.m3u8", pickVariant(variants, 720)!!.url)
        assertEquals("http://h/live/low/index.m3u8", pickVariant(variants, 240)!!.url)
        assertTrue(parseVariants("not a playlist", "http://h/").isEmpty())
    }

    @Test
    fun mediaAddressesCarryTheToken() {
        val api = Api()
        api.base = "http://h:1"
        api.token = "tok"
        assertEquals("http://h:1/api/v1/recordings/x/thumb.jpg?token=tok", api.thumbUrl("x"))
        assertEquals("http://h:1/api/v1/recordings/x/download?token=tok", api.fileUrl("x"))
        assertNotNull(api.exportUrl("x"))
    }

    @Test
    fun aSharedPlaylistListsItsChannelsAndAStreamListsNone() {
        val playlist = """#EXTM3U
#EXTINF:-1 tvg-logo="http://l/a.png" group-title="News",Alpha News
http://h/live/u/p/1.ts
#EXTINF:-1,Beta
rel/2.m3u8"""
        val channels = parsePlaylistChannels(playlist, "http://h/lists/x.m3u")
        assertEquals(listOf("Alpha News", "Beta"), channels.map { it.name })
        assertEquals("News", channels[0].group)
        assertEquals("http://h/lists/rel/2.m3u8", channels[1].url)
        assertTrue(parsePlaylistChannels("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8", "http://h/").isEmpty())
    }
}
