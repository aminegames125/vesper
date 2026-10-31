package dev.aminegames125.vesper.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.store: DataStore<Preferences> by preferencesDataStore("vesper")

data class Stored(val server: String = "", val token: String? = null, val username: String = "")

/** What the app remembers between runs: the server, the sign-in and which recordings it told you about. */
class Settings(private val context: Context) {
    private val serverKey = stringPreferencesKey("server")
    private val tokenKey = stringPreferencesKey("token")
    private val usernameKey = stringPreferencesKey("username")
    private val announcedKey = stringSetPreferencesKey("announced")
    private val favoritesKey = stringSetPreferencesKey("favorites")
    private val themeKey = stringPreferencesKey("theme")
    private val quietStartKey = stringPreferencesKey("quiet_start")
    private val quietEndKey = stringPreferencesKey("quiet_end")

    val stored: Flow<Stored> = context.store.data
        .catch { emit(emptyPreferences()) }
        .map { Stored(it[serverKey].orEmpty(), it[tokenKey], it[usernameKey].orEmpty()) }

    suspend fun current(): Stored = stored.first()

    suspend fun save(server: String, token: String?, username: String) {
        context.store.edit {
            it[serverKey] = server
            if (token == null) it.remove(tokenKey) else it[tokenKey] = token
            it[usernameKey] = username
            if (token == null) it.remove(announcedKey)
        }
    }

    suspend fun signOut() {
        context.store.edit {
            it.remove(tokenKey)
            it.remove(usernameKey)
            it.remove(announcedKey)
        }
    }

    val favorites: Flow<Set<String>> = context.store.data
        .catch { emit(emptyPreferences()) }
        .map { it[favoritesKey].orEmpty() }

    suspend fun toggleFavorite(url: String) {
        context.store.edit {
            val now = it[favoritesKey].orEmpty()
            it[favoritesKey] = if (url in now) now - url else now + url
        }
    }

    /** `system`, `light` or `dark`. */
    val theme: Flow<String> = context.store.data
        .catch { emit(emptyPreferences()) }
        .map { it[themeKey] ?: "system" }

    suspend fun setTheme(value: String) {
        context.store.edit { it[themeKey] = value }
    }

    /** Notifications from this app stay quiet between these two times (`HH:MM`); empty means never. */
    val quietStart: Flow<String> = context.store.data
        .catch { emit(emptyPreferences()) }
        .map { it[quietStartKey].orEmpty() }

    val quietEnd: Flow<String> = context.store.data
        .catch { emit(emptyPreferences()) }
        .map { it[quietEndKey].orEmpty() }

    suspend fun setQuiet(start: String, end: String) {
        context.store.edit {
            it[quietStartKey] = start
            it[quietEndKey] = end
        }
    }

    suspend fun announced(): Set<String>? = context.store.data.first()[announcedKey]

    suspend fun saveAnnounced(ids: Set<String>) {
        context.store.edit { it[announcedKey] = ids }
    }
}
