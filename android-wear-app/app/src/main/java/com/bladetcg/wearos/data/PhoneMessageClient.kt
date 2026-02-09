package com.bladetcg.wearos.data

import android.content.Context
import android.util.Log
import com.google.android.gms.wearable.Wearable
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

object PhoneMessageClient {
    private const val TAG = "BladeWearMessage"
    private const val TRIP_COMMAND_PATH = "/blade/trip-command"

    suspend fun sendTripCommand(context: Context, command: String) {
        try {
            val nodeClient = Wearable.getNodeClient(context)
            val nodes = suspendCancellableCoroutine { cont ->
                nodeClient.connectedNodes
                    .addOnSuccessListener { cont.resume(it) }
                    .addOnFailureListener { cont.resumeWithException(it) }
            }
            val messageClient = Wearable.getMessageClient(context)

            for (node in nodes) {
                Log.d(TAG, "Sending trip command '$command' to node: ${node.displayName}")
                suspendCancellableCoroutine { cont ->
                    messageClient.sendMessage(
                        node.id,
                        TRIP_COMMAND_PATH,
                        command.toByteArray()
                    )
                        .addOnSuccessListener { cont.resume(Unit) }
                        .addOnFailureListener { cont.resumeWithException(it) }
                }
                Log.d(TAG, "Trip command sent successfully")
            }

            if (nodes.isEmpty()) {
                Log.w(TAG, "No connected nodes found - phone may not be connected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send trip command: ${e.message}")
        }
    }
}
