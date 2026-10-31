package dev.aminegames125.vesper.data

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/** A Vesper server found on the local network. */
data class FoundServer(val name: String, val address: String)

private const val SERVICE_TYPE = "_vesper._tcp."

/**
 * Lists the Vesper servers that announce themselves on the local network, as they appear and
 * disappear. Emits nothing when the network does not allow it; typing an address still works.
 */
fun discoverServers(context: Context): Flow<List<FoundServer>> = callbackFlow {
    val manager = context.applicationContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    if (manager == null) {
        close()
        return@callbackFlow
    }
    val found = linkedMapOf<String, FoundServer>()
    fun publish() {
        trySend(found.values.toList())
    }

    fun resolved(info: NsdServiceInfo) {
        val host =
            if (Build.VERSION.SDK_INT >= 34) info.hostAddresses.firstOrNull()?.hostAddress
            else @Suppress("DEPRECATION") info.host?.hostAddress
        if (host != null) {
            val address = if (host.contains(':')) "[${host.substringBefore('%')}]:${info.port}" else "$host:${info.port}"
            synchronized(found) { found[info.serviceName] = FoundServer(info.serviceName, address) }
            publish()
        }
    }

    // Android resolves one service at a time, so the names are queued.
    val queue = ArrayDeque<NsdServiceInfo>()
    var resolving = false

    fun next() {
        if (resolving) return
        val item = queue.removeFirstOrNull() ?: return
        resolving = true
        @Suppress("DEPRECATION")
        manager.resolveService(
            item,
            object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    resolving = false
                    next()
                }

                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    resolved(serviceInfo)
                    resolving = false
                    next()
                }
            },
        )
    }

    val listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {}
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            close()
        }
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        override fun onDiscoveryStopped(serviceType: String) {}

        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
            synchronized(queue) { queue.addLast(serviceInfo) }
            next()
        }

        override fun onServiceLost(serviceInfo: NsdServiceInfo) {
            synchronized(found) { found.remove(serviceInfo.serviceName) }
            publish()
        }
    }
    runCatching { manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener) }
        .onFailure { close() }
    awaitClose { runCatching { manager.stopServiceDiscovery(listener) } }
}
