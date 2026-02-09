package com.bladetcg.watchconnectivity

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

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

        AsyncFunction("activateSession") { promise: Promise ->
            try {
                val context = appContext.reactContext
                if (context == null) {
                    promise.resolve(false)
                    return@AsyncFunction
                }
                messageClient = Wearable.getMessageClient(context)
                messageClient?.addListener(this@BladeWatchConnectivityModule)
                Log.d(TAG, "Session activated")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "activateSession failed: ${e.message}")
                promise.resolve(false)
            }
        }

        AsyncFunction("sendTelemetryToWatch") { isConnected: Boolean, serialNumber: String, motorName: String, speedKnots: Double, batteryPercent: Int, wattage: Double, isTripActive: Boolean, tripElapsedSeconds: Int, promise: Promise ->
            try {
                val context = appContext.reactContext
                if (context == null) {
                    promise.resolve(false)
                    return@AsyncFunction
                }
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

                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "sendTelemetryToWatch failed: ${e.message}")
                promise.resolve(false)
            }
        }

        AsyncFunction("isWatchPaired") { promise: Promise ->
            try {
                val context = appContext.reactContext
                if (context == null) {
                    promise.resolve(false)
                    return@AsyncFunction
                }
                val nodeClient = Wearable.getNodeClient(context)
                nodeClient.connectedNodes
                    .addOnSuccessListener { nodes ->
                        promise.resolve(nodes.isNotEmpty())
                    }
                    .addOnFailureListener {
                        promise.resolve(false)
                    }
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }

        AsyncFunction("isWatchReachable") { promise: Promise ->
            try {
                val context = appContext.reactContext
                if (context == null) {
                    promise.resolve(false)
                    return@AsyncFunction
                }
                val nodeClient = Wearable.getNodeClient(context)
                nodeClient.connectedNodes
                    .addOnSuccessListener { nodes ->
                        promise.resolve(nodes.any { it.isNearby })
                    }
                    .addOnFailureListener {
                        promise.resolve(false)
                    }
            } catch (e: Exception) {
                promise.resolve(false)
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
