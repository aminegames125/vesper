package dev.aminegames125.vesper.ui.kit

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/**
 * Vesper's own icons: a 24 unit grid, round 1.8 unit strokes, a few solid shapes. They are plain
 * path data, drawn here, so no icon library is needed. Tint them with [VIcon].
 */
private class Part(val d: String, val fill: Boolean = false, val line: Boolean = true)

private fun glyph(name: String, mirror: Boolean = false, vararg parts: Part): ImageVector {
    val builder = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
        autoMirror = mirror,
    )
    parts.forEach { part ->
        builder.addPath(
            pathData = PathParser().parsePathString(part.d).toNodes(),
            fill = if (part.fill) SolidColor(Color.Black) else null,
            stroke = if (part.line) SolidColor(Color.Black) else null,
            strokeLineWidth = 1.8f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return builder.build()
}

private fun line(d: String) = Part(d)
private fun solid(d: String) = Part(d, fill = true, line = false)
private fun both(d: String) = Part(d, fill = true, line = true)

object Ic {
    val Back: ImageVector by lazy { glyph("back", true, line("M19 12H5"), line("M11 6l-6 6 6 6")) }
    val Add: ImageVector by lazy { glyph("add", false, line("M12 5v14"), line("M5 12h14")) }
    val Close: ImageVector by lazy { glyph("close", false, line("M6 6l12 12"), line("M18 6L6 18")) }
    val Check: ImageVector by lazy { glyph("check", false, line("M5 12.5l4.5 4.5L19 7.5")) }
    val Delete: ImageVector by lazy {
        glyph(
            "delete", false,
            line("M4 7h16"), line("M10 11v6"), line("M14 11v6"),
            line("M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"), line("M9 7V4h6v3"),
        )
    }
    val More: ImageVector by lazy {
        glyph(
            "more", false,
            solid("M12 4.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z"),
            solid("M12 10.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z"),
            solid("M12 16.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z"),
        )
    }
    val Cast: ImageVector by lazy {
        glyph(
            "cast", false,
            line("M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"),
            line("M3 12a9 9 0 0 1 9 9"), line("M3 16a5 5 0 0 1 5 5"), line("M3 20h.01"),
        )
    }
    val CastOn: ImageVector by lazy {
        glyph(
            "castOn", false,
            line("M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"),
            line("M3 12a9 9 0 0 1 9 9"), line("M3 16a5 5 0 0 1 5 5"), line("M3 20h.01"),
            solid("M14.5 8.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4z"),
        )
    }
    val Download: ImageVector by lazy { glyph("download", false, line("M12 4v11"), line("M7 11l5 5 5-5"), line("M5 20h14")) }
    val Play: ImageVector by lazy { glyph("play", false, both("M8 4.8l11 7.2-11 7.2z")) }
    val Star: ImageVector by lazy {
        glyph("star", false, line("M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"))
    }
    val StarOn: ImageVector by lazy {
        glyph("starOn", false, both("M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"))
    }
    val Record: ImageVector by lazy {
        glyph("record", false, solid("M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z"), line("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z"))
    }
    val Warning: ImageVector by lazy { glyph("warning", false, line("M12 4l9 16H3z"), line("M12 10v4"), line("M12 17.2h.01")) }
    val Refresh: ImageVector by lazy {
        glyph(
            "refresh", false,
            line("M20 11a8 8 0 0 0-14.5-4.5L4 8"), line("M4 4v4h4"),
            line("M4 13a8 8 0 0 0 14.5 4.5L20 16"), line("M20 20v-4h-4"),
        )
    }
    val Calendar: ImageVector by lazy {
        glyph(
            "calendar", false,
            line("M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"),
            line("M4 10.5h16"), line("M8 3.5v4"), line("M16 3.5v4"),
        )
    }
    val Library: ImageVector by lazy {
        glyph(
            "library", false,
            line("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z"),
            both("M10 8.6v6.8l5.6-3.4z"),
        )
    }
    val Sliders: ImageVector by lazy {
        glyph(
            "sliders", false,
            line("M4 8h9"), line("M19 8h1"), line("M16 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4z"),
            line("M4 16h1"), line("M11 16h9"), line("M8 14a2 2 0 1 0 0 4a2 2 0 1 0 0-4z"),
        )
    }
    val Home: ImageVector by lazy {
        glyph("home", false, line("M4 11l8-6.5 8 6.5"), line("M6 10v9a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1v-9"))
    }
    val Tv: ImageVector by lazy {
        glyph(
            "tv", false,
            line("M4 8h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"),
            line("M8 4l4 4 4-4"),
        )
    }
    val Quality: ImageVector by lazy {
        glyph(
            "quality", false,
            line("M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"),
            line("M8 9.5v5"), line("M8 12h3"), line("M11 9.5v5"),
            line("M14 9.5h1.5a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H14z"),
        )
    }
    val BookmarkAdd: ImageVector by lazy {
        glyph("bookmarkAdd", false, line("M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"), line("M12 8v4"), line("M10 10h4"))
    }
    val Bookmarks: ImageVector by lazy { glyph("bookmarks", false, line("M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z")) }
    val Pip: ImageVector by lazy {
        glyph(
            "pip", false,
            line("M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"),
            solid("M12 12h6v4h-6z"),
        )
    }
    val Search: ImageVector by lazy { glyph("search", false, line("M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z"), line("M20 20l-4-4")) }
    val Guide: ImageVector by lazy {
        glyph(
            "guide", false,
            line("M9 6h11"), line("M9 12h11"), line("M9 18h11"),
            line("M4 6h.01"), line("M4 12h.01"), line("M4 18h.01"),
        )
    }
    val Clock: ImageVector by lazy { glyph("clock", false, line("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z"), line("M12 7.5V12l3 2")) }
    val Left: ImageVector by lazy { glyph("left", false, line("M15 6l-6 6 6 6")) }
    val Right: ImageVector by lazy { glyph("right", false, line("M9 6l6 6-6 6")) }
    val Up: ImageVector by lazy { glyph("up", false, line("M6 15l6-6 6 6")) }
    val Down: ImageVector by lazy { glyph("down", false, line("M6 9l6 6 6-6")) }
    val Copy: ImageVector by lazy {
        glyph(
            "copy", false,
            line("M9 9h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"),
            line("M16 9V6a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"),
        )
    }
    val Pause: ImageVector by lazy { glyph("pause", false, line("M9 5v14"), line("M15 5v14")) }
    val Folder: ImageVector by lazy {
        glyph("folder", false, line("M4 7a1 1 0 0 1 1-1h4.5l2 2.5H19a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"))
    }
}
