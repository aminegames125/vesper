package dev.aminegames125.vesper.data.repo

import dev.aminegames125.vesper.data.remote.VesperApi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException

@Serializable
data class ServerInfo(
    val name: String = "Vesper Cloud",
    val version: String = "",
    val mode: String = "lite",
    val registration: String = "closed",
    val needsSetup: Boolean = false,
)

@Serializable
data class CloudUser(val id: String, val username: String, val role: String)

@Serializable
data class CloudSessionDto(val token: String, val user: CloudUser)

@Serializable
data class CloudRecording(
    val id: String,
    val title: String,
    val channelName: String = "",
    val status: String,
    val startAt: Long = 0,
    val maxSeconds: Int = 0,
    val seconds: Int = 0,
    val bytes: Long = 0,
    val keepUntil: Long? = null,
    val error: String? = null,
)

@Serializable
data class CloudRecordings(
    val recordings: List<CloudRecording> = emptyList(),
    val storageUsed: Long = 0,
    @SerialName("storageLimit") val storageLimit: Long = 0,
)

/** A signed-in Vesper Cloud server. In lite mode there is no login, so the token stays empty. */
data class CloudSession(val url: String, val token: String?, val username: String?)

class CloudException(message: String) : Exception(message)

@Singleton
class CloudRepository @Inject constructor(
    private val api: VesperApi,
    private val settings: SettingsRepository,
    private val json: Json,
) {
    val session: Flow<CloudSession?> = combine(
        settings.observe(URL),
        settings.observe(TOKEN),
        settings.observe(USER),
    ) { url, token, user -> url?.takeIf { it.isNotBlank() }?.let { CloudSession(it, token?.takeIf(String::isNotBlank), user) } }

    suspend fun current(): CloudSession? = settings.get(URL)?.takeIf { it.isNotBlank() }
        ?.let { CloudSession(it, settings.get(TOKEN)?.takeIf(String::isNotBlank), settings.get(USER)) }

    suspend fun info(address: String): Result<ServerInfo> = call {
        json.decodeFromJsonElement(ServerInfo.serializer(), api.getJson("${normalize(address)}/api/v1/info"))
    }

    /** Connects to a server. Lite servers need no login; full ones sign in with a username. */
    suspend fun connect(address: String, username: String, password: String, register: Boolean, invite: String): Result<CloudSession> = call {
        val base = normalize(address)
        val info = json.decodeFromJsonElement(ServerInfo.serializer(), api.getJson("$base/api/v1/info"))
        val connected: CloudSession
        if (info.mode == "lite") {
            connected = CloudSession(base, null, null)
        } else {
            val path = if (register) "/auth/register" else "/auth/login"
            val body: JsonObject = buildJsonObject {
                put("username", username.trim())
                put("password", password)
                if (register && invite.isNotBlank()) put("invite", invite.trim())
            }
            val dto = json.decodeFromJsonElement(CloudSessionDto.serializer(), api.postJson("$base/api/v1$path", body))
            connected = CloudSession(base, dto.token, dto.user.username)
        }
        save(connected)
        connected
    }

    suspend fun disconnect() {
        val s = current()
        if (s?.token != null) runCatching { api.postJson("${s.url}/api/v1/auth/logout", buildJsonObject {}, bearer(s)) }
        listOf(URL, TOKEN, USER).forEach { settings.remove(it) }
    }

    suspend fun recordings(): Result<CloudRecordings> = call {
        val s = current() ?: throw CloudException("Not connected to a Vesper Cloud server.")
        json.decodeFromJsonElement(CloudRecordings.serializer(), api.getJson("${s.url}/api/v1/recordings", bearer(s)))
    }

    suspend fun record(title: String, channelName: String, url: String, seconds: Int, startAt: Long?, keepHours: Int?): Result<Unit> = call {
        val s = current() ?: throw CloudException("Not connected to a Vesper Cloud server.")
        val body = buildJsonObject {
            put("title", title)
            put("channel_name", channelName)
            put("url", url)
            put("seconds", seconds)
            if (startAt != null) put("start_at", startAt)
            if (keepHours != null) put("keep_hours", keepHours)
        }
        api.postJson("${s.url}/api/v1/recordings", body, bearer(s))
        Unit
    }

    suspend fun stop(id: String): Result<Unit> = call {
        val s = current() ?: throw CloudException("Not connected to a Vesper Cloud server.")
        api.postJson("${s.url}/api/v1/recordings/$id/stop", buildJsonObject {}, bearer(s))
        Unit
    }

    suspend fun delete(id: String): Result<Unit> = call {
        val s = current() ?: throw CloudException("Not connected to a Vesper Cloud server.")
        api.deleteJson("${s.url}/api/v1/recordings/$id", bearer(s))
        Unit
    }

    /** The HLS playlist of a recording; it plays even while the recording is still running. */
    fun playlistUrl(session: CloudSession, id: String): String =
        "${session.url}/api/v1/recordings/$id/index.m3u8" + (session.token?.let { "?token=$it" } ?: "")

    private suspend fun save(session: CloudSession) {
        settings.put(URL, session.url)
        if (session.token != null) settings.put(TOKEN, session.token) else settings.remove(TOKEN)
        if (session.username != null) settings.put(USER, session.username) else settings.remove(USER)
    }

    private fun bearer(s: CloudSession) = s.token?.let { "Bearer $it" }

    private fun normalize(input: String): String {
        val trimmed = input.trim().trimEnd('/')
        return if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) trimmed else "http://$trimmed"
    }

    /** Turns network and HTTP failures into a message a person can act on. */
    private suspend fun <T> call(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: HttpException) {
        val body = runCatching { e.response()?.errorBody()?.string() }.getOrNull()
        val message = body?.let { runCatching { (json.parseToJsonElement(it) as JsonObject)["error"] }.getOrNull() }
            ?.let { (it as? JsonPrimitive)?.content }
        Result.failure(CloudException(message ?: "The server answered ${e.code()}."))
    } catch (e: CloudException) {
        Result.failure(e)
    } catch (e: java.io.IOException) {
        Result.failure(CloudException("Could not reach the server. Check the address and your network."))
    } catch (e: kotlinx.serialization.SerializationException) {
        Result.failure(CloudException("That address does not look like a Vesper Cloud server."))
    }

    private companion object {
        const val URL = "cloud.url"
        const val TOKEN = "cloud.token"
        const val USER = "cloud.user"
    }
}
