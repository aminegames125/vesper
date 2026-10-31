package dev.aminegames125.vesper.data.repo

import dev.aminegames125.vesper.data.db.SettingDao
import dev.aminegames125.vesper.data.db.SettingEntity
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map

enum class ThemeMode { System, Dark, Light }

/** Which rows the Home screen shows. Everything is on until the viewer turns it off. */
data class HomeOptions(val live: Boolean = true, val movies: Boolean = true, val shows: Boolean = true)

object HomeKeys {
    const val LIVE = "home.live"
    const val MOVIES = "home.movies"
    const val SHOWS = "home.shows"
}

@Singleton
class SettingsRepository @Inject constructor(private val dao: SettingDao) {

    val theme: Flow<ThemeMode> = dao.observe(THEME).map { value ->
        ThemeMode.entries.firstOrNull { it.name == value } ?: ThemeMode.Dark
    }

    val homeOptions: Flow<HomeOptions> = combine(
        dao.observe(HomeKeys.LIVE),
        dao.observe(HomeKeys.MOVIES),
        dao.observe(HomeKeys.SHOWS),
    ) { live, movies, shows -> HomeOptions(live != "0", movies != "0", shows != "0") }

    suspend fun setHomeOption(key: String, on: Boolean) = dao.put(SettingEntity(key, if (on) "1" else "0"))

    suspend fun setTheme(mode: ThemeMode) = dao.put(SettingEntity(THEME, mode.name))

    fun observe(key: String): Flow<String?> = dao.observe(key)

    suspend fun get(key: String): String? = dao.get(key)

    suspend fun put(key: String, value: String) = dao.put(SettingEntity(key, value))

    suspend fun remove(key: String) = dao.remove(key)

    private companion object {
        const val THEME = "theme"
    }
}
