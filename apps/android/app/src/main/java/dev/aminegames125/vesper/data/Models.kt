package dev.aminegames125.vesper.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ServerInfo(
    val mode: String = "lite",
    val version: String = "",
    val needsSetup: Boolean = false,
    val registration: String = "closed",
) {
    val isFull get() = mode == "full"
}

@Serializable
data class User(
    val id: String = "",
    val username: String = "",
    val role: String = "user",
    val storageUsed: Long = 0,
    @SerialName("storage_bytes") val storageBytes: Long = 0,
    @SerialName("max_hours") val maxHours: Long = 0,
)

@Serializable
data class Session(val token: String, val user: User)

@Serializable
data class Recording(
    val id: String,
    val title: String,
    val channelName: String = "",
    val status: String,
    val startAt: Long = 0,
    val maxSeconds: Long = 0,
    val seconds: Long = 0,
    val bytes: Long = 0,
    val keepUntil: Long? = null,
    val error: String? = null,
    val createdAt: Long = 0,
    val finishedAt: Long? = null,
    val scheduleId: String? = null,
) {
    val isRunning get() = status == "recording"
    val isScheduled get() = status == "scheduled"
    val isFinished get() = status == "done" || status == "failed"
    val isPlayable get() = status == "done" || status == "recording"
}

@Serializable
data class RecordingList(
    val recordings: List<Recording> = emptyList(),
    val storageUsed: Long = 0,
    val storageLimit: Long = 0,
)

@Serializable
data class Schedule(
    val id: String,
    val title: String,
    val channelName: String = "",
    val url: String,
    val tz: String,
    val startTime: String,
    val seconds: Long,
    val days: Int = 0,
    val startDate: String,
    val endDate: String? = null,
    val padBefore: Long = 0,
    val padAfter: Long = 0,
    val keepHours: Long? = null,
    val enabled: Boolean = true,
    val nextStart: Long? = null,
)

@Serializable
data class ScheduleList(val schedules: List<Schedule> = emptyList())

/** What the app sends to create or change a schedule; the names are the server's. */
@Serializable
data class NewSchedule(
    val title: String,
    @SerialName("channel_name") val channelName: String = "",
    val url: String,
    val tz: String,
    @SerialName("start_time") val startTime: String,
    val seconds: Long,
    val days: Int = 0,
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("pad_before") val padBefore: Long = 0,
    @SerialName("pad_after") val padAfter: Long = 0,
    @SerialName("keep_hours") val keepHours: Long? = null,
    val enabled: Boolean = true,
)

@Serializable
data class SaveReply(val id: String? = null, val warnings: List<String> = emptyList())

@Serializable
data class NewRecording(
    val title: String,
    @SerialName("channel_name") val channelName: String = "",
    val url: String,
    /** 0 records until it is stopped. */
    val seconds: Long,
)

@Serializable
data class Source(
    val id: String,
    val name: String,
    val kind: String,
    val url: String,
    val username: String = "",
)

@Serializable
data class SourceList(val sources: List<Source> = emptyList())

@Serializable
data class NewSource(
    val name: String,
    val kind: String,
    val url: String,
    val username: String = "",
    val password: String = "",
)

@Serializable
data class Channel(
    val name: String,
    val url: String,
    val group: String = "",
    val logo: String = "",
)

@Serializable
data class ChannelPage(
    val channels: List<Channel> = emptyList(),
    val total: Int = 0,
    val groups: List<String> = emptyList(),
)

@Serializable
internal data class Credentials(val username: String, val password: String, val invite: String? = null)

@Serializable
internal data class ErrorBody(val error: String = "")
