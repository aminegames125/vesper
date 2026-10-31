package dev.aminegames125.vesper.data

import java.time.DayOfWeek
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class DataTest {
    @Test
    fun `server addresses get a scheme and lose the trailing slash`() {
        assertEquals("http://192.168.1.20:8484", normalizeServer(" 192.168.1.20:8484/ "))
        assertEquals("https://rec.example.com", normalizeServer("https://rec.example.com/"))
        assertEquals("", normalizeServer("  "))
    }

    @Test
    fun `days read the way people say them`() {
        assertEquals("Once", describeDays(0))
        assertEquals("Every day", describeDays(EVERY_DAY))
        assertEquals("Weekdays", describeDays(WEEKDAYS))
        assertEquals("Weekends", describeDays(WEEKEND))
        assertEquals(1, bit(DayOfWeek.MONDAY))
        assertEquals(64, bit(DayOfWeek.SUNDAY))
    }

    @Test
    fun `durations and sizes are short`() {
        assertEquals("30 min", formatDuration(1800))
        assertEquals("1 h 30 min", formatDuration(5400))
        assertEquals("2 h", formatDuration(7200))
        assertEquals("20 s", formatDuration(20))
        assertEquals("512 B", formatBytes(512))
        assertEquals("1.5 MB", formatBytes(1_572_864))
    }

    @Test
    fun `an upcoming start says how far away it is`() {
        assertEquals("now", formatUntil(1000, nowSeconds = 990))
        assertEquals("in 5 min", formatUntil(1300, nowSeconds = 1000))
        assertEquals("in 2 h", formatUntil(1000 + 7300, nowSeconds = 1000))
        assertEquals("in 3 d", formatUntil(1000 + 3 * 86_400 + 5, nowSeconds = 1000))
    }

    @Test
    fun `recordings and schedules decode from the server's json`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(
                MockResponse().setBody(
                    """{"recordings":[{"id":"r1","title":"News","channelName":"Alpha","status":"recording",
                    "startAt":100,"maxSeconds":1800,"seconds":60,"bytes":1000,"scheduleId":"s1","extra":true}],
                    "storageUsed":1000,"storageLimit":5000}""",
                ),
            )
            server.enqueue(
                MockResponse().setBody(
                    """{"schedules":[{"id":"s1","title":"News","url":"http://x/a.ts","tz":"UTC","startTime":"11:00",
                    "seconds":1800,"days":31,"startDate":"2026-11-02","enabled":true,"nextStart":1793456160}]}""",
                ),
            )
            val api = Api().apply { base = server.url("/").toString().trimEnd('/') }
            val recordings = api.recordings()
            assertEquals(1, recordings.recordings.size)
            assertTrue(recordings.recordings[0].isRunning)
            assertEquals(5000, recordings.storageLimit)
            val schedules = api.schedules()
            assertEquals(WEEKDAYS, schedules[0].days)
            assertEquals(1793456160L, schedules[0].nextStart)
        }
    }

    @Test
    fun `a schedule is sent with the server's field names`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"id":"s1","warnings":["Overlaps"]}"""))
            val api = Api().apply { base = server.url("/").toString().trimEnd('/') }
            val reply = api.createSchedule(
                NewSchedule("News", "Alpha", "http://x/a.ts", "Europe/Paris", "11:00", 1800, WEEKDAYS, "2026-11-02", padBefore = 60),
            )
            assertEquals(listOf("Overlaps"), reply.warnings)
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/v1/schedules", request.path)
            val body = request.body.readUtf8()
            assertTrue(body, body.contains("\"start_time\":\"11:00\""))
            assertTrue(body, body.contains("\"pad_before\":60"))
            assertTrue(body, body.contains("\"channel_name\":\"Alpha\""))
            assertTrue(body, !body.contains("end_date"))
        }
    }

    @Test
    fun `the server's error message reaches the caller`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(403).setBody("""{"error":"Your cloud storage is full."}"""))
            val api = Api().apply { base = server.url("/").toString().trimEnd('/') }
            try {
                api.recordNow(NewRecording("X", "X", "http://x/a.ts", 0))
                fail("expected an error")
            } catch (e: ApiException) {
                assertEquals("Your cloud storage is full.", e.message)
                assertEquals(403, e.code)
            }
        }
    }

    @Test
    fun `the playlist address carries the token for media`() {
        val api = Api().apply {
            base = "http://h:1"
            token = "abc"
        }
        assertEquals("http://h:1/api/v1/recordings/r1/index.m3u8?token=abc", api.playlistUrl("r1"))
    }
}
