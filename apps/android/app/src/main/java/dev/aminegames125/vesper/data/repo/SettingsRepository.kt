package dev.aminegames125.vesper.data.repo

import dev.aminegames125.vesper.data.db.SettingDao
import dev.aminegames125.vesper.data.db.SettingEntity
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class ThemeMode { System, Dark, Light }

@Singleton
class SettingsRepository @Inject constructor(private val dao: SettingDao) {

    val theme: Flow<ThemeMode> = dao.observe(THEME).map { value ->
        ThemeMode.entries.firstOrNull { it.name == value } ?: ThemeMode.Dark
    }

    suspend fun setTheme(mode: ThemeMode) = dao.put(SettingEntity(THEME, mode.name))

    fun observe(key: String): Flow<String?> = dao.observe(key)

    suspend fun get(key: String): String? = dao.get(key)

    suspend fun put(key: String, value: String) = dao.put(SettingEntity(key, value))

    suspend fun remove(key: String) = dao.remove(key)

    private companion object {
        const val THEME = "theme"
    }
}
