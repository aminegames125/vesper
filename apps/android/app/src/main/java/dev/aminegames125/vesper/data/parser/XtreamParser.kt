package dev.aminegames125.vesper.data.parser

import dev.aminegames125.vesper.data.db.ChannelEntity
import dev.aminegames125.vesper.data.db.MovieEntity
import dev.aminegames125.vesper.data.db.ShowEntity
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Xtream panels send numbers as strings, strings as numbers and sometimes `false` instead of a list. */
internal fun JsonElement?.text(): String? =
    (this as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotEmpty() && it != "null" }

internal fun JsonElement?.long(): Long? = text()?.toDoubleOrNull()?.toLong()

internal fun JsonElement?.double(): Double? = text()?.toDoubleOrNull()?.takeIf { it > 0 }

internal fun JsonElement?.objects(): List<JsonObject> =
    (this as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()

data class XtreamAccount(
    val active: Boolean,
    val expires: Long?,
    val maxConnections: Int,
)

data class Episode(
    val id: String,
    val season: Int,
    val number: Int,
    val title: String,
    val plot: String?,
    val image: String?,
    val url: String,
)

data class Detail(
    val plot: String? = null,
    val cast: String? = null,
    val genre: String? = null,
    val year: String? = null,
    val backdrop: String? = null,
)

object XtreamParser {
    fun host(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        return if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(trimmed)) trimmed else "http://$trimmed"
    }

    fun apiUrl(host: String, user: String, pass: String, action: String? = null, extra: Map<String, String> = emptyMap()): String {
        val query = buildList {
            add("username=${enc(user)}")
            add("password=${enc(pass)}")
            if (action != null) add("action=$action")
            extra.forEach { (k, v) -> add("$k=${enc(v)}") }
        }.joinToString("&")
        return "${host(host)}/player_api.php?$query"
    }

    private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8")

    fun liveUrl(host: String, user: String, pass: String, streamId: Long) =
        "${host(host)}/live/$user/$pass/$streamId.m3u8"

    fun movieUrl(host: String, user: String, pass: String, streamId: Long, ext: String) =
        "${host(host)}/movie/$user/$pass/$streamId.$ext"

    fun episodeUrl(host: String, user: String, pass: String, id: String, ext: String) =
        "${host(host)}/series/$user/$pass/$id.$ext"

    fun account(json: JsonElement): XtreamAccount {
        val info = (json as? JsonObject)?.get("user_info") as? JsonObject
        if (info == null || info["auth"].long() == 0L) error("The server rejected these credentials.")
        return XtreamAccount(
            active = info["status"].text() == "Active",
            expires = info["exp_date"].long()?.takeIf { it > 0 },
            maxConnections = info["max_connections"].long()?.toInt() ?: 1,
        )
    }

    private fun categories(json: JsonElement?): Map<String, String> =
        json.objects().mapNotNull { o ->
            val id = o["category_id"].text() ?: return@mapNotNull null
            id to (o["category_name"].text() ?: "Other")
        }.toMap()

    fun channels(
        sourceId: String,
        host: String,
        user: String,
        pass: String,
        categories: JsonElement?,
        streams: JsonElement,
    ): List<ChannelEntity> {
        val names = categories(categories)
        return streams.objects().mapNotNull { s ->
            val streamId = s["stream_id"].long() ?: return@mapNotNull null
            ChannelEntity(
                id = "$sourceId:live:$streamId",
                sourceId = sourceId,
                name = s["name"].text() ?: "Channel $streamId",
                grp = names[s["category_id"].text()] ?: "Other",
                logo = s["stream_icon"].text(),
                url = liveUrl(host, user, pass, streamId),
                tvgId = s["epg_channel_id"].text(),
            )
        }
    }

    fun movies(sourceId: String, categories: JsonElement?, streams: JsonElement): List<MovieEntity> {
        val names = categories(categories)
        return streams.objects().mapNotNull { m ->
            val streamId = m["stream_id"].long() ?: return@mapNotNull null
            MovieEntity(
                id = "$sourceId:movie:$streamId",
                sourceId = sourceId,
                streamId = streamId,
                name = m["name"].text() ?: "Movie $streamId",
                grp = names[m["category_id"].text()] ?: "Other",
                poster = m["stream_icon"].text(),
                rating = m["rating"].double(),
                extension = m["container_extension"].text() ?: "mp4",
                addedAt = m["added"].long() ?: 0,
            )
        }
    }

    fun shows(sourceId: String, categories: JsonElement?, series: JsonElement): List<ShowEntity> {
        val names = categories(categories)
        return series.objects().mapNotNull { s ->
            val seriesId = s["series_id"].long() ?: return@mapNotNull null
            ShowEntity(
                id = "$sourceId:show:$seriesId",
                sourceId = sourceId,
                seriesId = seriesId,
                name = s["name"].text() ?: "Series $seriesId",
                grp = names[s["category_id"].text()] ?: "Other",
                cover = s["cover"].text(),
                plot = s["plot"].text(),
                rating = s["rating"].double(),
                year = (s["releaseDate"].text() ?: s["release_date"].text())?.take(4),
            )
        }
    }

    private fun backdrop(info: JsonObject?): String? {
        val b = info?.get("backdrop_path") ?: return null
        return if (b is JsonArray) b.firstOrNull().text() else b.text()
    }

    fun movieDetail(json: JsonElement): Detail {
        val info = (json as? JsonObject)?.get("info") as? JsonObject
        return Detail(
            plot = info?.get("plot").text() ?: info?.get("description").text(),
            cast = info?.get("cast").text() ?: info?.get("actors").text(),
            genre = info?.get("genre").text(),
            year = (info?.get("releasedate").text() ?: info?.get("release_date").text())?.take(4),
            backdrop = backdrop(info),
        )
    }

    fun show(json: JsonElement, host: String, user: String, pass: String): Pair<Detail, List<Episode>> {
        val root = json as? JsonObject
        val info = root?.get("info") as? JsonObject
        val detail = Detail(
            plot = info?.get("plot").text(),
            cast = info?.get("cast").text(),
            genre = info?.get("genre").text(),
            year = (info?.get("releaseDate").text() ?: info?.get("release_date").text())?.take(4),
            backdrop = backdrop(info),
        )
        val episodesElement = root?.get("episodes")
        // Panels send either {"1": [...], "2": [...]} or a single flat list.
        val seasons: List<Pair<String, JsonElement>> = when (episodesElement) {
            is JsonObject -> episodesElement.entries.map { it.key to it.value }
            is JsonArray -> listOf("1" to episodesElement)
            else -> emptyList()
        }
        val episodes = seasons.flatMap { (season, list) ->
            list.objects().mapNotNull { e ->
                val id = e["id"].text() ?: return@mapNotNull null
                val number = e["episode_num"].long()?.toInt() ?: 0
                val epInfo = e["info"] as? JsonObject
                Episode(
                    id = id,
                    season = e["season"].long()?.toInt() ?: season.toIntOrNull() ?: 1,
                    number = number,
                    title = e["title"].text() ?: "Episode $number",
                    plot = epInfo?.get("plot").text(),
                    image = epInfo?.get("movie_image").text(),
                    url = episodeUrl(host, user, pass, id, e["container_extension"].text() ?: "mp4"),
                )
            }
        }.sortedWith(compareBy({ it.season }, { it.number }))
        return detail to episodes
    }
}
