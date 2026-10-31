package dev.aminegames125.vesper.data

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale

/** Bit 0 is Monday and bit 6 is Sunday, like the server. A mask of 0 means "once". */
const val WEEKDAYS = 0b0011111
const val WEEKEND = 0b1100000
const val EVERY_DAY = 0b1111111

fun bit(day: DayOfWeek): Int = 1 shl (day.value - 1)

fun describeDays(mask: Int): String = when (mask) {
    0 -> "Once"
    EVERY_DAY -> "Every day"
    WEEKDAYS -> "Weekdays"
    WEEKEND -> "Weekends"
    else -> DayOfWeek.entries
        .filter { mask and bit(it) != 0 }
        .joinToString(", ") { it.getDisplayName(TextStyle.SHORT, Locale.getDefault()) }
}

/** "1 h 30 min", "45 min" or "20 s". */
fun formatDuration(seconds: Long): String {
    val s = seconds.coerceAtLeast(0)
    val h = s / 3600
    val m = (s % 3600) / 60
    return when {
        h > 0 && m > 0 -> "$h h $m min"
        h > 0 -> "$h h"
        m > 0 -> "$m min"
        else -> "$s s"
    }
}

fun formatBytes(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val units = listOf("KB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var unit = -1
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024
        unit++
    }
    return if (value >= 100) {
        "%.0f %s".format(Locale.US, value, units[unit])
    } else {
        "%.1f %s".format(Locale.US, value, units[unit])
    }
}

/** A moment in the viewer's own time zone, for example "Nov 2, 2026, 11:00 AM". */
fun formatMoment(epochSeconds: Long, zone: ZoneId = ZoneId.systemDefault()): String =
    DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
        .withZone(zone)
        .format(Instant.ofEpochSecond(epochSeconds))

/** "1:05:09" or "5:09" for a position in a recording. */
fun formatClock(seconds: Long): String {
    val s = seconds.coerceAtLeast(0)
    val h = s / 3600
    val m = (s % 3600) / 60
    val rest = s % 60
    return if (h > 0) "%d:%02d:%02d".format(Locale.US, h, m, rest) else "%d:%02d".format(Locale.US, m, rest)
}

/** "Deleted in 6 days", "Deleted in 5 h" or null when it stays until someone deletes it. */
fun formatExpiry(keepUntil: Long?, nowSeconds: Long = System.currentTimeMillis() / 1000): String? {
    keepUntil ?: return null
    val left = keepUntil - nowSeconds
    return when {
        left <= 0 -> "Deleting soon"
        left < 3600 -> "Deleted in ${(left / 60).coerceAtLeast(1)} min"
        left < 86_400 -> "Deleted in ${left / 3600} h"
        else -> "Deleted in ${left / 86_400} d"
    }
}

/** True when [now] falls between [start] and [end] (`HH:MM`), which may run past midnight. Empty means never. */
fun withinQuietHours(start: String, end: String, now: java.time.LocalTime): Boolean {
    val from = runCatching { java.time.LocalTime.parse(start.trim().padStart(5, '0')) }.getOrNull() ?: return false
    val to = runCatching { java.time.LocalTime.parse(end.trim().padStart(5, '0')) }.getOrNull() ?: return false
    return when {
        from == to -> false
        from < to -> now >= from && now < to
        else -> now >= from || now < to
    }
}

/** The keep times offered for a recording or download, in hours; 0 keeps it until deleted. */
val KEEP_CHOICES: List<Pair<Long, String>> = listOf(
    24L to "1 day",
    168L to "1 week",
    720L to "1 month",
    0L to "Keep forever",
)

/** "in 5 min", "in 2 h" or "now" for an upcoming start. */
fun formatUntil(epochSeconds: Long, nowSeconds: Long = System.currentTimeMillis() / 1000): String {
    val left = epochSeconds - nowSeconds
    return when {
        left <= 30 -> "now"
        left < 3600 -> "in ${(left / 60).coerceAtLeast(1)} min"
        left < 86_400 -> "in ${left / 3600} h"
        else -> "in ${left / 86_400} d"
    }
}
