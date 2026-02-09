package com.bladetcg.wearos.data

import android.util.Log
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

class DataLayerListenerService : WearableListenerService() {

    companion object {
        private const val TAG = "BladeWearDataLayer"
        private const val TELEMETRY_PATH = "/blade/telemetry"
        private const val MOTOR_STATUS_PATH = "/blade/motor-status"
        private const val TRIP_STATUS_PATH = "/blade/trip-status"
        private const val TRIP_COMMAND_PATH = "/blade/trip-command"
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        Log.d(TAG, "onDataChanged: ${dataEvents.count} events")
        for (event in dataEvents) {
            if (event.type == DataEvent.TYPE_CHANGED) {
                val dataItem = event.dataItem
                val path = dataItem.uri.path ?: continue
                val dataMap = DataMapItem.fromDataItem(dataItem).dataMap

                Log.d(TAG, "Data changed at path: $path")

                when (path) {
                    TELEMETRY_PATH -> {
                        val map = mutableMapOf<String, Any>()
                        if (dataMap.containsKey("speedKnots")) map["speedKnots"] = dataMap.getDouble("speedKnots")
                        if (dataMap.containsKey("batteryPercent")) map["batteryPercent"] = dataMap.getInt("batteryPercent")
                        if (dataMap.containsKey("wattage")) map["wattage"] = dataMap.getDouble("wattage")
                        MotorState.updateFromMap(map)
                    }
                    MOTOR_STATUS_PATH -> {
                        val map = mutableMapOf<String, Any>()
                        if (dataMap.containsKey("isConnected")) map["isConnected"] = dataMap.getBoolean("isConnected")
                        if (dataMap.containsKey("serialNumber")) map["serialNumber"] = dataMap.getString("serialNumber") as Any
                        if (dataMap.containsKey("motorName")) map["motorName"] = dataMap.getString("motorName") as Any
                        MotorState.updateFromMap(map)
                    }
                    TRIP_STATUS_PATH -> {
                        val map = mutableMapOf<String, Any>()
                        if (dataMap.containsKey("isTripActive")) map["isTripActive"] = dataMap.getBoolean("isTripActive")
                        if (dataMap.containsKey("tripElapsedSeconds")) map["tripElapsedSeconds"] = dataMap.getInt("tripElapsedSeconds")
                        if (dataMap.containsKey("tripStartTime")) map["tripStartTime"] = dataMap.getLong("tripStartTime")
                        MotorState.updateFromMap(map)
                    }
                }
            }
        }
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        Log.d(TAG, "Message received: ${messageEvent.path}")
        val path = messageEvent.path
        val data = String(messageEvent.data)

        when (path) {
            TELEMETRY_PATH, MOTOR_STATUS_PATH, TRIP_STATUS_PATH -> {
                try {
                    val map = parseJsonToMap(data)
                    MotorState.updateFromMap(map)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse message data: ${e.message}")
                }
            }
        }
    }

    private fun parseJsonToMap(json: String): Map<String, Any> {
        val map = mutableMapOf<String, Any>()
        val cleaned = json.trim().removePrefix("{").removeSuffix("}")
        if (cleaned.isBlank()) return map

        val pairs = cleaned.split(",")
        for (pair in pairs) {
            val keyValue = pair.split(":", limit = 2)
            if (keyValue.size != 2) continue
            val key = keyValue[0].trim().removeSurrounding("\"")
            val value = keyValue[1].trim()

            when {
                value == "true" -> map[key] = true
                value == "false" -> map[key] = false
                value.startsWith("\"") -> map[key] = value.removeSurrounding("\"")
                value.contains(".") -> value.toDoubleOrNull()?.let { map[key] = it }
                else -> value.toLongOrNull()?.let { map[key] = it }
            }
        }
        return map
    }
}
