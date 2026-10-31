package dev.aminegames125.vesper.data.remote

import kotlinx.serialization.json.JsonElement
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Streaming
import retrofit2.http.Url

/**
 * One Retrofit interface for everything the app talks to. The address changes per provider and per
 * Vesper Cloud server, so each call carries its full URL.
 */
interface VesperApi {
    @GET
    suspend fun getJson(@Url url: String, @Header("Authorization") auth: String? = null): JsonElement

    @POST
    suspend fun postJson(
        @Url url: String,
        @Body body: JsonElement,
        @Header("Authorization") auth: String? = null,
    ): JsonElement

    @PUT
    suspend fun putJson(
        @Url url: String,
        @Body body: JsonElement,
        @Header("Authorization") auth: String? = null,
    ): JsonElement

    @DELETE
    suspend fun deleteJson(@Url url: String, @Header("Authorization") auth: String? = null): JsonElement

    /** Playlists can be tens of megabytes, so they are read as a stream instead of a string. */
    @Streaming
    @GET
    suspend fun getStream(@Url url: String): ResponseBody
}
