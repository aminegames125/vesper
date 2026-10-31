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
) {
    val isAdmin get() = role == "admin"
}

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
    val keepHours: Long? = null,
    val keepUntil: Long? = null,
    val error: String? = null,
    val createdAt: Long = 0,
    val finishedAt: Long? = null,
    val scheduleId: String? = null,
    /** `recording` or `download`. */
    val kind: String = "recording",
    val tag: String = "",
    val watched: Boolean = false,
    val positionS: Long = 0,
    val thumb: Boolean = false,
    val totalBytes: Long? = null,
    val fileName: String? = null,
) {
    val isRunning get() = status == "recording"
    val isScheduled get() = status == "scheduled"
    val isFinished get() = status == "done" || status == "failed"
    val isPlayable get() = status == "done" || status == "recording"
    val isDownload get() = kind == "download"

    /** Share of a download that has arrived, when the size is known. */
    val progress: Float?
        get() = totalBytes?.takeIf { it > 0 && isRunning && isDownload }?.let { (bytes.toFloat() / it).coerceIn(0f, 1f) }
}

@Serializable
data class RecordingList(
    val recordings: List<Recording> = emptyList(),
    val tags: List<String> = emptyList(),
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
    val keepLast: Long? = null,
    val enabled: Boolean = true,
    val nextStart: Long? = null,
    val backupUrl: String? = null,
    val quality: String = "best",
    val webhookUrl: String? = null,
    val tag: String = "",
    val epgId: String = "",
    val followGuide: Boolean = false,
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
    /** 0 keeps the recordings forever; null uses the server's default timer. */
    @SerialName("keep_hours") val keepHours: Long? = null,
    @SerialName("keep_last") val keepLast: Long? = null,
    val enabled: Boolean = true,
    @SerialName("backup_url") val backupUrl: String? = null,
    val quality: String = "best",
    @SerialName("webhook_url") val webhookUrl: String? = null,
    val tag: String = "",
    @SerialName("epg_id") val epgId: String = "",
    @SerialName("follow_guide") val followGuide: Boolean = false,
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
    @SerialName("keep_hours") val keepHours: Long? = null,
    @SerialName("backup_url") val backupUrl: String? = null,
    val tag: String = "",
)

@Serializable
data class NewDownload(
    val title: String,
    val url: String,
    @SerialName("keep_hours") val keepHours: Long? = null,
    val tag: String = "",
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
    /** The playlist's id for the channel, used to find it in the guide. */
    val id: String = "",
    /** `live`, `movie` or `series`. */
    val kind: String = "live",
    /** Other addresses of the same channel, when sources are merged. */
    val alt: List<String> = emptyList(),
) {
    val isLive get() = kind == "live"
}

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

@Serializable
data class NextUp(val title: String, val startAt: Long)

@Serializable
data class Expiring(val id: String, val title: String, val keepUntil: Long)

@Serializable
data class BrokenChannel(val name: String = "", val detail: String = "", val checkedAt: Long = 0)

/** The server's own summary of itself, shown in Settings. */
@Serializable
data class Status(
    val version: String = "",
    val diskFree: Long? = null,
    val diskTotal: Long? = null,
    val recording: Int = 0,
    val scheduled: Int = 0,
    val failed: Int = 0,
    val next: NextUp? = null,
    /** MP4 export, cutting and thumbnails need ffmpeg on the server. */
    val ffmpeg: Boolean = false,
    val perDayBytes: Long = 0,
    val daysLeft: Long? = null,
    val expiring: List<Expiring> = emptyList(),
    val brokenChannels: List<BrokenChannel> = emptyList(),
    val updateAvailable: String? = null,
    val defaultKeepHours: Long? = null,
)

@Serializable
data class UseRow(val name: String = "", val bytes: Long = 0, val count: Int = 0)

@Serializable
data class BiggestRow(val id: String = "", val title: String = "", val bytes: Long = 0)

@Serializable
data class StorageUse(
    val folders: List<UseRow> = emptyList(),
    val sources: List<UseRow> = emptyList(),
    val biggest: List<BiggestRow> = emptyList(),
)

@Serializable
data class ProbeReply(
    val ok: Boolean = false,
    val status: Int = 0,
    val bytes: Long = 0,
    val kbps: Long = 0,
    val error: String? = null,
)

@Serializable
data class Programme(
    val startAt: Long,
    val stopAt: Long,
    val title: String,
    val description: String = "",
)

@Serializable
data class GuideReply(val channelId: String? = null, val programmes: List<Programme> = emptyList())

@Serializable
data class GuideHit(
    val channelId: String,
    val channelName: String = "",
    val startAt: Long,
    val stopAt: Long,
    val title: String,
    val description: String = "",
)

@Serializable
data class GuideHits(val programmes: List<GuideHit> = emptyList())

@Serializable
data class GuideStatus(
    val configured: Boolean = false,
    val channels: Int = 0,
    val programmes: Int = 0,
    val updatedAt: Long? = null,
)

@Serializable
data class SeriesRule(
    val id: String,
    val title: String,
    val epgChannelId: String = "",
    val channelName: String = "",
    val url: String = "",
    val keepLast: Long? = null,
    val tag: String = "",
    val enabled: Boolean = true,
)

@Serializable
data class RuleList(val rules: List<SeriesRule> = emptyList())

@Serializable
data class NewRule(
    val title: String,
    @SerialName("epg_channel_id") val epgChannelId: String,
    @SerialName("channel_name") val channelName: String = "",
    val url: String,
    @SerialName("backup_url") val backupUrl: String? = null,
    @SerialName("pad_before") val padBefore: Long = 0,
    @SerialName("pad_after") val padAfter: Long = 0,
    @SerialName("keep_hours") val keepHours: Long? = null,
    @SerialName("keep_last") val keepLast: Long? = null,
    val tag: String = "",
)

@Serializable
data class CalendarItem(
    val id: String,
    val title: String,
    val channelName: String = "",
    val startAt: Long,
    val endAt: Long,
    val status: String = "scheduled",
    /** More recordings run together than the account allows. */
    val clash: Boolean = false,
)

@Serializable
data class CalendarReply(val items: List<CalendarItem> = emptyList())

@Serializable
data class Bookmark(val id: String, val atS: Long, val label: String = "")

@Serializable
data class BookmarkList(val bookmarks: List<Bookmark> = emptyList())

@Serializable
data class ShareReply(val token: String, val path: String, val download: String = "", val expiresAt: Long = 0)

@Serializable
data class ImportReply(val added: Int = 0, val problems: List<String> = emptyList())

@Serializable
internal data class Patch(
    val title: String? = null,
    val tag: String? = null,
    @SerialName("keep_hours") val keepHours: Long? = null,
    val watched: Boolean? = null,
    @SerialName("position_s") val positionS: Long? = null,
)

@Serializable
internal data class Probe(val url: String, val seconds: Long? = null)

@Serializable
internal data class BookmarkBody(@SerialName("at_s") val atS: Long, val label: String = "")

@Serializable
internal data class Hours(val hours: Long)

@Serializable
internal data class Trim(@SerialName("from_s") val fromS: Long, @SerialName("to_s") val toS: Long)
