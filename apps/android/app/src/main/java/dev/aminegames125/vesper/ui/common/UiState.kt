package dev.aminegames125.vesper.ui.common

/** What a screen is showing. Each ViewModel exposes one of these as a StateFlow. */
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data object Empty : UiState<Nothing>
    data class Content<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}
