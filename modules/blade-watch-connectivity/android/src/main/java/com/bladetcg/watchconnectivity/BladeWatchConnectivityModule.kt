package com.bladetcg.watchconnectivity

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class BladeWatchConnectivityModule : Module(), MessageClient.OnMessageReceivedListener {
    companion object {
        private const val TAG = "BladeWearBridge"
        private const val TELEMETRY_PATH = "/blade/telemetry"
        private const val MOTOR_STATUS_PATH = "/blade/motor-status"
        private const val TRIP_STATUS_PATH = "/blade/trip-status"
        private const val TRIP_COMMAND_PATH = "/blade/trip-command"
    }

    private var messageClient: MessageClient? = null

    override fun definition() = ModuleDefinition {
        Name("BladeWatchConnectivity")

        Events("onWatchTripCommand")

        OnCreate {
            try {
                val context = appContext.reactContext ?: return@OnCreate
                messageClient = Wearable.getMessageClient(context)
                messageClient?.addListener(this@BladeWatchConnectivityModule)
                Log.d(TAG, "MessageClient listener registered")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize MessageClient: ${e.message}")
            }
        }

        OnDestroy {
            try {
                messageClient?.removeListener(this@BladeWatchConnectivityModule)
                Log.d(TAG, "MessageClient listener removed")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to remove MessageClient listener: ${e.message}")
            }
        }

        AsyncFunction("activateSession") {
            try {
                val context = appContext.reactContext ?: return@AsyncFunction false
                messageClient = Wearable.getMessageClient(context)
                messageClient?.addListener(this@BladeWatchConnectivityModule)
                Log.d(TAG, "Session activated")
                return@AsyncFunction true
            } catch (e: Exception) {
                Log.e(TAG, "activateSession failed: ${e.message}")
                return@AsyncFunction false
            }
        }

        AsyncFunction("sendTelemetryToWatch") { isConnected: Boolean, serialNumber: String, motorName: String, speedKnots: Double, batteryPercent: Int, wattage: Double, isTripActive: Boolean, tripElapsedSeconds: Int ->
            try {
                val context = appContext.reactContext ?: return@AsyncFunction false
                val dataClient = Wearable.getDataClient(context)

                val telemetryReq = PutDataMapRequest.create(TELEMETRY_PATH).apply {
                    dataMap.putDouble("speedKnots", speedKnots)
                    dataMap.putInt("batteryPercent", batteryPercent)
                    dataMap.putDouble("wattage", wattage)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                }
                dataClient.putDataItem(telemetryReq.asPutDataRequest().setUrgent())

                val motorReq = PutDataMapRequest.create(MOTOR_STATUS_PATH).apply {
                    dataMap.putBoolean("isConnected", isConnected)
                    dataMap.putString("serialNumber", serialNumber)
                    dataMap.putString("motorName", motorName)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                }
                dataClient.putDataItem(motorReq.asPutDataRequest().setUrgent())

                val tripReq = PutDataMapRequest.create(TRIP_STATUS_PATH).apply {
                    dataMap.putBoolean("isTripActive", isTripActive)
                    dataMap.putInt("tripElapsedSeconds", tripElapsedSeconds)
                    dataMap.putLong("tripStartTime", if (isTripActive) System.currentTimeMillis() - (tripElapsedSeconds * 1000L) else 0L)
                    dataMap.putLong("timestamp", System.currentTimeMillis())
                }
                dataClient.putDataItem(tripReq.asPutDataRequest().setUrgent())

                return@AsyncFunction true
            } catch (e: Exception) {
                Log.e(TAG, "sendTelemetryToWatch failed: ${e.message}")
                return@AsyncFunction false
            }
        }

        AsyncFunction("isWatchPaired") {
            try {
                val context = appContext.reactContext ?: return@AsyncFunction false
                val nodeClient = Wearable.getNodeClient(context)
                return@AsyncFunction suspendCoroutine<Boolean> { cont ->
                    nodeClient.connectedNodes
                        .addOnSuccessListener { nodes ->
                            cont.resume(nodes.isNotEmpty())
                        }
                        .addOnFailureListener {
                            cont.resume(false)
                        }
                }
            } catch (e: Exception) {
                return@AsyncFunction false
            }
        }

        AsyncFunction("isWatchReachable") {
            try {
                val context = appContext.reactContext ?: return@AsyncFunction false
                val nodeClient = Wearable.getNodeClient(context)
                return@AsyncFunction suspendCoroutine<Boolean> { cont ->
                    nodeClient.connectedNodes
                        .addOnSuccessListener { nodes ->
                            cont.resume(nodes.any { it.isNearby })
                        }
                        .addOnFailureListener {
                            cont.resume(false)
                        }
                }
            } catch (e: Exception) {
                return@AsyncFunction false
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        Log.d(TAG, "Message received from watch: ${messageEvent.path}")
        if (messageEvent.path == TRIP_COMMAND_PATH) {
            val command = String(messageEvent.data)
            Log.d(TAG, "Trip command from watch: $command")
            sendEvent("onWatchTripCommand", mapOf("command" to command))
        }
    }
}
