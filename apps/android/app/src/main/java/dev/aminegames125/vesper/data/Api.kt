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

    private suspend fun send(method: String, path: String, body: String? = null): String =
        withContext(Dispatchers.IO) {
            val url = "$base/api/v1$path".toHttpUrlOrNull()
                ?: throw ApiException("That server address is not valid.")
            val request = Request.Builder().url(url).apply {
                token?.let { header("Authorization", "Bearer $it") }
                val payload = (body ?: if (method == "GET") null else "{}")?.toRequestBody(jsonType)
                method(method, payload)
            }.build()
            try {
                http.newCall(request).execute().use { response ->
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

    suspend fun recordings(): RecordingList = get("/recordings")

    suspend fun recordNow(body: NewRecording) {
        send("POST", "/recordings", AppJson.encodeToString(body))
    }

    suspend fun stopRecording(id: String) {
        send("POST", "/recordings/$id/stop")
    }

    suspend fun deleteRecording(id: String) {
        send("DELETE", "/recordings/$id")
    }

    suspend fun renameRecording(id: String, title: String) {
        send("PATCH", "/recordings/$id", AppJson.encodeToString(Rename(title)))
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

    suspend fun testChannel(url: String): ProbeReply = call("POST", "/channels/test", Probe(url))

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

    suspend fun channels(source: String, query: String, group: String, offset: Int, limit: Int = 100): ChannelPage {
        val url = "$base/api/v1/channels".toHttpUrlOrNull()
            ?: throw ApiException("That server address is not valid.")
        val withQuery = url.newBuilder()
            .addQueryParameter("source", source)
            .addQueryParameter("q", query)
            .addQueryParameter("group", group)
            .addQueryParameter("offset", offset.toString())
            .addQueryParameter("limit", limit.toString())
            .build()
        return try {
            AppJson.decodeFromString(send("GET", "/channels?${withQuery.encodedQuery}"))
        } catch (e: SerializationException) {
            unexpected()
        }
    }

    /** The recording as an HLS playlist; the server accepts the token in the address for media. */
    fun playlistUrl(id: String): String =
        "$base/api/v1/recordings/$id/index.m3u8" + (token?.let { "?token=$it" } ?: "")
}
