package expo.modules.bladeliveactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class BladeForegroundService : Service() {

    companion object {
        const val ACTION_START = "com.bladeoutboards.ACTION_START"
        const val ACTION_UPDATE = "com.bladeoutboards.ACTION_UPDATE"
        const val ACTION_STOP = "com.bladeoutboards.ACTION_STOP"
        const val CHANNEL_ID = "blade_live_activity"
        const val NOTIFICATION_ID = 9001
    }

    private var serialNumber: String = ""
    private var wattageKW: Double = 0.0
    private var batteryPercent: Int = 0
    private var isRecording: Boolean = false
    private var tripDuration: String = "00:00"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                extractData(intent)
                createNotificationChannel()
                startForeground(NOTIFICATION_ID, buildNotification())
            }
            ACTION_UPDATE -> {
                extractData(intent)
                val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                manager.notify(NOTIFICATION_ID, buildNotification())
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun extractData(intent: Intent) {
        serialNumber = intent.getStringExtra("serialNumber") ?: serialNumber
        wattageKW = intent.getDoubleExtra("wattageKW", wattageKW)
        batteryPercent = intent.getIntExtra("batteryPercent", batteryPercent)
        isRecording = intent.getBooleanExtra("isRecording", isRecording)
        tripDuration = intent.getStringExtra("tripDuration") ?: tripDuration
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Blade Outboards Motor Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows motor telemetry and trip status"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): android.app.Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Blade Outboards - $serialNumber")
            .setContentText("\u26A1 $wattageKW kW | \uD83D\uDD0B $batteryPercent%")
            .setSmallIcon(android.R.drawable.ic_lock_idle_charging)
            .setColor(Color.parseColor("#0A4D6E"))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(contentIntent)

        if (isRecording) {
            builder.setSubText("\u25CF Recording $tripDuration")

            val stopTripIntent = Intent("com.bladeoutboards.ACTION_STOP_TRIP").apply {
                setPackage(packageName)
            }
            val stopTripPending = PendingIntent.getBroadcast(
                this,
                1,
                stopTripIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(0, "Stop Trip", stopTripPending)
        } else {
            builder.setSubText("Connected")

            val startTripIntent = Intent("com.bladeoutboards.ACTION_START_TRIP").apply {
                setPackage(packageName)
            }
            val startTripPending = PendingIntent.getBroadcast(
                this,
                2,
                startTripIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(0, "Start Trip", startTripPending)
        }

        return builder.build()
    }
}
