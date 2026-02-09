package com.bladetcg.wearos.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class MotorData(
    val isConnected: Boolean = false,
    val serialNumber: String = "--",
    val motorName: String = "Blade Halo Series",
    val speedKnots: Double = 0.0,
    val batteryPercent: Int = 0,
    val wattage: Double = 0.0,
    val isTripActive: Boolean = false,
    val tripElapsedSeconds: Int = 0,
    val tripStartTime: Long = 0L
)

object MotorState {
    private val _motorData = MutableStateFlow(MotorData())
    val motorData: StateFlow<MotorData> = _motorData.asStateFlow()

    fun update(transform: (MotorData) -> MotorData) {
        _motorData.value = transform(_motorData.value)
    }

    fun updateFromMap(data: Map<String, Any>) {
        _motorData.value = _motorData.value.copy(
            isConnected = (data["isConnected"] as? Boolean) ?: _motorData.value.isConnected,
            serialNumber = (data["serialNumber"] as? String) ?: _motorData.value.serialNumber,
            motorName = (data["motorName"] as? String) ?: _motorData.value.motorName,
            speedKnots = (data["speedKnots"] as? Number)?.toDouble() ?: _motorData.value.speedKnots,
            batteryPercent = (data["batteryPercent"] as? Number)?.toInt() ?: _motorData.value.batteryPercent,
            wattage = (data["wattage"] as? Number)?.toDouble() ?: _motorData.value.wattage,
            isTripActive = (data["isTripActive"] as? Boolean) ?: _motorData.value.isTripActive,
            tripElapsedSeconds = (data["tripElapsedSeconds"] as? Number)?.toInt() ?: _motorData.value.tripElapsedSeconds,
            tripStartTime = (data["tripStartTime"] as? Number)?.toLong() ?: _motorData.value.tripStartTime
        )
    }
}
