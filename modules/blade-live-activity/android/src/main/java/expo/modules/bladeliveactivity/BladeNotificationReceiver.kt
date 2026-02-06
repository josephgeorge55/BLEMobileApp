package expo.modules.bladeliveactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

class BladeNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val deepLink = when (intent.action) {
            "com.bladeoutboards.ACTION_START_TRIP" -> "bladeoutboards://trip/start"
            "com.bladeoutboards.ACTION_STOP_TRIP" -> "bladeoutboards://trip/stop"
            else -> return
        }

        val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            setPackage(context.packageName)
        }
        context.startActivity(launchIntent)
    }
}
