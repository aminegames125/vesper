package dev.aminegames125.vesper.di

import android.content.Context
import androidx.room.Room
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dev.aminegames125.vesper.data.db.VesperDatabase
import dev.aminegames125.vesper.data.remote.VesperApi
import dev.aminegames125.vesper.recording.HlsRecorder
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): VesperDatabase =
        Room.databaseBuilder(context, VesperDatabase::class.java, "vesper.db").build()

    @Provides fun sourceDao(db: VesperDatabase) = db.sources()

    @Provides fun libraryDao(db: VesperDatabase) = db.library()

    @Provides fun favoriteDao(db: VesperDatabase) = db.favorites()

    @Provides fun historyDao(db: VesperDatabase) = db.history()

    @Provides fun recordingDao(db: VesperDatabase) = db.recordings()

    @Provides fun settingDao(db: VesperDatabase) = db.settings()

    @Provides
    @Singleton
    fun json(): Json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Provides
    @Singleton
    fun okHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    @Provides
    @Singleton
    fun api(client: OkHttpClient, json: Json): VesperApi =
        Retrofit.Builder()
            // Every call passes its own full address with @Url; this base is never used.
            .baseUrl("http://localhost/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(VesperApi::class.java)

    @Provides
    @Singleton
    fun recorder(client: OkHttpClient): HlsRecorder = HlsRecorder(client)
}
