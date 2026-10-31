package dev.aminegames125.vesper.player

import dev.aminegames125.vesper.data.repo.PlayItem
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What is playing right now. Screens ask it to play; the player screen draws it on top of everything. */
@Singleton
class PlayerSession @Inject constructor() {
    private val _current = MutableStateFlow<PlayItem?>(null)
    val current: StateFlow<PlayItem?> = _current.asStateFlow()

    fun play(item: PlayItem) {
        _current.value = item
    }

    fun close() {
        _current.value = null
    }
}
