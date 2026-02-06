package expo.modules.bladeliveactivity

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class BladeLiveActivityModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("BladeLiveActivity")

        AsyncFunction("startLiveActivity") { serialNumber: String, wattageKW: Double, batteryPercent: Int, isRecording: Boolean, tripDuration: String ->
            val context = appContext.reactContext ?: throw Exception("Context not available")
            val activityId = UUID.randomUUID().toString()

            val intent = Intent(context, BladeForegroundService::class.java).apply {
                action = BladeForegroundService.ACTION_START
                putExtra("serialNumber", serialNumber)
                putExtra("wattageKW", wattageKW)
                putExtra("batteryPercent", batteryPercent)
                putExtra("isRecording", isRecording)
                putExtra("tripDuration", tripDuration)
                putExtra("activityId", activityId)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            return@AsyncFunction activityId
        }

        AsyncFunction("updateLiveActivity") { serialNumber: String, wattageKW: Double, batteryPercent: Int, isRecording: Boolean, tripDuration: String ->
            val context = appContext.reactContext ?: return@AsyncFunction false

            val intent = Intent(context, BladeForegroundService::class.java).apply {
                action = BladeForegroundService.ACTION_UPDATE
                putExtra("serialNumber", serialNumber)
                putExtra("wattageKW", wattageKW)
                putExtra("batteryPercent", batteryPercent)
                putExtra("isRecording", isRecording)
                putExtra("tripDuration", tripDuration)
            }

            context.startService(intent)
            return@AsyncFunction true
        }

        AsyncFunction("endLiveActivity") {
            val context = appContext.reactContext ?: return@AsyncFunction false

            val intent = Intent(context, BladeForegroundService::class.java).apply {
                action = BladeForegroundService.ACTION_STOP
            }

            context.startService(intent)
            return@AsyncFunction true
        }

        AsyncFunction("isLiveActivitySupported") {
            return@AsyncFunction Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        }
    }
}
