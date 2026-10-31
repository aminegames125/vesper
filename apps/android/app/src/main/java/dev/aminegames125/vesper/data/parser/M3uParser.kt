package dev.aminegames125.vesper.data.parser

import dev.aminegames125.vesper.data.db.ChannelEntity

private val ATTR = Regex("""([\w-]+)="([^"]*)"""")
private const val DEFAULT_GROUP = "Ungrouped"

/** Parses an extended M3U playlist into channels. Tolerates CRLF, a BOM and missing attributes. */
object M3uParser {
    fun parse(lines: Sequence<String>, sourceId: String): List<ChannelEntity> {
        val channels = mutableListOf<ChannelEntity>()
        var name = ""
        var group = DEFAULT_GROUP
        var logo: String? = null
        var tvgId: String? = null
        var pending = false

        for ((index, raw) in lines.withIndex()) {
            val line = (if (index == 0) raw.removePrefix("﻿") else raw).trim()
            if (line.isEmpty()) continue

            if (line.startsWith("#EXTINF")) {
                val attrs = ATTR.findAll(line).associate { it.groupValues[1].lowercase() to it.groupValues[2] }
                val comma = line.indexOf(',', line.lastIndexOf('"') + 1)
                val title = if (comma == -1) "" else line.substring(comma + 1).trim()
                name = title.ifEmpty { attrs["tvg-name"].orEmpty() }.ifEmpty { "Untitled" }
                group = attrs["group-title"]?.trim().takeUnless { it.isNullOrEmpty() } ?: DEFAULT_GROUP
                logo = attrs["tvg-logo"]?.takeIf { it.isNotEmpty() }
                tvgId = attrs["tvg-id"]?.takeIf { it.isNotEmpty() }
                pending = true
                continue
            }
            if (line.startsWith("#")) continue

            if (pending) {
                channels += ChannelEntity(
                    id = "$sourceId:${channels.size}:${hash(line)}",
                    sourceId = sourceId,
                    name = name,
                    grp = group,
                    logo = logo,
                    url = line,
                    tvgId = tvgId,
                )
                pending = false
            }
        }
        return channels
    }

    fun parse(text: String, sourceId: String): List<ChannelEntity> =
        parse(text.lineSequence(), sourceId)

    private fun hash(value: String): String {
        var h = 5381
        for (c in value) h = (h shl 5) + h + c.code
        return (h.toLong() and 0xFFFFFFFFL).toString(36)
    }
}
