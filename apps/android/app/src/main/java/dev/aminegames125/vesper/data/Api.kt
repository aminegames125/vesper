package dev.aminegames125.vesper.data

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** A failure with a message that is fit to show to the person using the app. */
class ApiException(message: String, val code: Int = 0) : Exception(message)

internal val AppJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

/** Turns what someone typed ("192.168.1.20:8484") into a base address. */
fun normalizeServer(input: String): String {
    val trimmed = input.trim().trimEnd('/')
    if (trimmed.isEmpty()) return ""
    return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "http://$trimmed"
}

/** The Vesper server's HTTP API. */
class Api(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build(),
) {
    @Volatile var base: String = ""
    @Volatile var token: String? = null

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private suspend fun send(method: String, path: String, body: String? = null, slow: Boolean = false): String =
        withContext(Dispatchers.IO) {
            val url = "$base/api/v1$path".toHttpUrlOrNull()
                ?: throw ApiException("That server address is not valid.")
            val request = Request.Builder().url(url).apply {
                token?.let { header("Authorization", "Bearer $it") }
                val payload = (body ?: if (method == "GET") null else "{}")?.toRequestBody(jsonType)
                method(method, payload)
            }.build()
            try {
                // A conversion on the server can take minutes; the answer comes when it is done.
                val client = if (slow) http.newBuilder().readTimeout(20, TimeUnit.MINUTES).build() else http
                client.newCall(request).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val message = runCatching { AppJson.decodeFromString<ErrorBody>(text).error }
                            .getOrNull()?.takeIf { it.isNotBlank() }
                        throw ApiException(message ?: "The server answered ${response.code}.", response.code)
                    }
                    text
                }
            } catch (e: ApiException) {
                throw e
            } catch (e: IOException) {
                throw ApiException("Could not reach the server. Check the address and your network.")
            }
        }

    private fun unexpected(): Nothing = throw ApiException("That does not look like a Vesper server.")

    private inline fun <reified T> decode(text: String): T = try {
        AppJson.decodeFromString(text)
    } catch (e: SerializationException) {
        unexpected()
    }

    private suspend inline fun <reified T> get(path: String): T {
        val text = send("GET", path)
        return try {
            AppJson.decodeFromString(text)
        } catch (e: SerializationException) {
            unexpected()
        }
    }

    private suspend inline fun <reified T, reified B> call(method: String, path: String, body: B): T {
        val text = send(method, path, AppJson.encodeToString(body))
        return try {
            AppJson.decodeFromString(text)
        } catch (e: SerializationException) {
            unexpected()
        }
    }

    suspend fun info(): ServerInfo = get("/info")
    suspend fun me(): User = get("/auth/me")
    suspend fun login(username: String, password: String): Session =
        call("POST", "/auth/login", Credentials(username.trim(), password))

    suspend fun register(username: String, password: String, invite: String?): Session =
        call("POST", "/auth/register", Credentials(username.trim(), password, invite?.ifBlank { null }))

    suspend fun logout() {
        runCatching { send("POST", "/auth/logout") }
    }

    suspend fun recordings(tag: String = "", query: String = ""): RecordingList {
        val url = "$base/api/v1/recordings".toHttpUrlOrNull()
            ?: throw ApiException("That server address is not valid.")
        val withQuery = url.newBuilder().addQueryParameter("tag", tag).addQueryParameter("q", query).build()
        return decode(send("GET", "/recordings?${withQuery.encodedQuery}"))
    }

    suspend fun download(body: NewDownload) {
        send("POST", "/downloads", AppJson.encodeToString(body))
    }

    suspend fun recordNow(body: NewRecording) {
        send("POST", "/recordings", AppJson.encodeToString(body))
    }

    suspend fun stopRecording(id: String) {
        send("POST", "/recordings/$id/stop")
    }

    suspend fun deleteRecording(id: String) {
        send("DELETE", "/recordings/$id")
    }

    suspend fun renameRecording(id: String, title: String) = patch(id, Patch(title = title))

    private suspend fun patch(id: String, body: Patch) {
        send("PATCH", "/recordings/$id", AppJson.encodeToString(body))
    }

    /** Hours from now until the item is deleted; 0 keeps it until someone deletes it. */
    suspend fun setKeep(id: String, hours: Long) = patch(id, Patch(keepHours = hours))

    suspend fun setTag(id: String, tag: String) = patch(id, Patch(tag = tag))

    suspend fun setWatched(id: String, watched: Boolean) = patch(id, Patch(watched = watched))

    suspend fun savePosition(id: String, seconds: Long) = patch(id, Patch(positionS = seconds))

    suspend fun bookmarks(id: String): List<Bookmark> = get<BookmarkList>("/recordings/$id/bookmarks").bookmarks

    suspend fun addBookmark(id: String, atS: Long, label: String = "") {
        send("POST", "/recordings/$id/bookmarks", AppJson.encodeToString(BookmarkBody(atS, label)))
    }

    suspend fun deleteBookmark(id: String, bookmark: String) {
        send("DELETE", "/recordings/$id/bookmarks/$bookmark")
    }

    /** A link that plays the recording without signing in, for the given number of hours. */
    suspend fun share(id: String, hours: Long = 24): String {
        val reply: ShareReply = call("POST", "/recordings/$id/share", Hours(hours))
        return base + reply.path
    }

    suspend fun exportMp4(id: String) {
        send("POST", "/recordings/$id/export", slow = true)
    }

    suspend fun trim(id: String, fromS: Long, toS: Long) {
        send("POST", "/recordings/$id/trim", AppJson.encodeToString(Trim(fromS, toS)))
    }

    suspend fun storage(): StorageUse = get("/status/storage")

    suspend fun guide(epgId: String, name: String, from: Long, to: Long): GuideReply {
        val url = "$base/api/v1/guide".toHttpUrlOrNull()
            ?: throw ApiException("That server address is not valid.")
        val withQuery = url.newBuilder()
            .addQueryParameter("epg_id", epgId)
            .addQueryParameter("name", name)
            .addQueryParameter("from", from.toString())
            .addQueryParameter("to", to.toString())
            .build()
        return decode(send("GET", "/guide?${withQuery.encodedQuery}"))
    }

    suspend fun searchGuide(query: String): List<GuideHit> {
        val url = "$base/api/v1/guide/search".toHttpUrlOrNull()
            ?: throw ApiException("That server address is not valid.")
        val withQuery = url.newBuilder().addQueryParameter("q", query).build()
        return decode<GuideHits>(send("GET", "/guide/search?${withQuery.encodedQuery}")).programmes
    }

    suspend fun guideStatus(): GuideStatus = get("/guide/status")

    suspend fun refreshGuide() {
        send("POST", "/guide/refresh")
    }

    suspend fun seriesRules(): List<SeriesRule> = get<RuleList>("/series-rules").rules

    suspend fun createRule(body: NewRule) {
        send("POST", "/series-rules", AppJson.encodeToString(body))
    }

    suspend fun deleteRule(id: String) {
        send("DELETE", "/series-rules/$id")
    }

    suspend fun calendar(from: Long, to: Long): List<CalendarItem> =
        get<CalendarReply>("/calendar?from=$from&to=$to").items

    /** The account's schedules as the text of a file, to keep or move to another server. */
    suspend fun exportSchedules(): String = send("GET", "/schedules/export")

    suspend fun importSchedules(json: String): ImportReply = decode(send("POST", "/schedules/import", json))

    /** Admin only: the server-wide settings, such as the default deletion timer. */
    suspend fun adminSettings(): Map<String, String> = get("/admin/settings")

    suspend fun setSetting(key: String, value: String) {
        send("PUT", "/admin/settings", AppJson.encodeToString(mapOf(key to value)))
    }

    suspend fun clearFailed() {
        send("POST", "/recordings/clear-failed")
    }

    suspend fun runSchedule(id: String) {
        send("POST", "/schedules/$id/run")
    }

    suspend fun duplicateSchedule(id: String) {
        send("POST", "/schedules/$id/duplicate")
    }

    suspend fun pauseAll(paused: Boolean) {
        send("POST", "/schedules/pause", """{"paused":$paused}""")
    }

    suspend fun status(): Status = get("/status")

    /** Opens the stream; with [seconds] (3 to 30) the server records a throwaway sample instead. */
    suspend fun testChannel(url: String, seconds: Long? = null): ProbeReply =
        call("POST", "/channels/test", Probe(url, seconds))

    suspend fun schedules(): List<Schedule> = get<ScheduleList>("/schedules").schedules

    suspend fun createSchedule(body: NewSchedule): SaveReply = call("POST", "/schedules", body)

    suspend fun updateSchedule(id: String, body: NewSchedule): SaveReply = call("PUT", "/schedules/$id", body)

    suspend fun setScheduleEnabled(id: String, enabled: Boolean) {
        send("PATCH", "/schedules/$id", """{"enabled":$enabled}""")
    }

    suspend fun deleteSchedule(id: String) {
        send("DELETE", "/schedules/$id")
    }

    suspend fun sources(): List<Source> = get<SourceList>("/sources").sources

    suspend fun createSource(body: NewSource) {
        send("POST", "/sources", AppJson.encodeToString(body))
    }

    suspend fun deleteSource(id: String) {
        send("DELETE", "/sources/$id")
    }

    suspend fun channels(
        source: String,
        query: String,
        group: String,
        offset: Int,
        limit: Int = 100,
        kind: String = "",
    ): ChannelPage {
        val url = "$base/api/v1/channels".toHttpUrlOrNull()
            ?: throw ApiException("That server address is not valid.")
        val withQuery = url.newBuilder()
            .addQueryParameter("source", source)
            .addQueryParameter("q", query)
            .addQueryParameter("group", group)
            .addQueryParameter("kind", kind)
            .addQueryParameter("offset", offset.toString())
            .addQueryParameter("limit", limit.toString())
            .build()
        return try {
            AppJson.decodeFromString(send("GET", "/channels?${withQuery.encodedQuery}"))
        } catch (e: SerializationException) {
            unexpected()
        }
    }

    private fun media(path: String): String =
        "$base/api/v1/recordings/$path" + (token?.let { "?token=$it" } ?: "")

    /** The recording as an HLS playlist; the server accepts the token in the address for media. */
    fun playlistUrl(id: String): String = media("$id/index.m3u8")

    /** The whole item as one file; supports seeking, so players and the download manager can use it. */
    fun fileUrl(id: String): String = media("$id/download")

    fun thumbUrl(id: String): String = media("$id/thumb.jpg")

    fun exportUrl(id: String): String = media("$id/export.mp4")
}
