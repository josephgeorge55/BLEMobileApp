package com.bladetcg.wearos.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import com.bladetcg.wearos.data.MotorState
import com.bladetcg.wearos.data.PhoneMessageClient
import com.bladetcg.wearos.presentation.theme.BladeColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun TripScreen() {
    val motorData by MotorState.motorData.collectAsState()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var displaySeconds by remember { mutableIntStateOf(0) }

    LaunchedEffect(motorData.isTripActive) {
        if (!motorData.isTripActive) {
            displaySeconds = 0
        }
    }

    LaunchedEffect(motorData.tripElapsedSeconds) {
        displaySeconds = motorData.tripElapsedSeconds
    }

    LaunchedEffect(motorData.isTripActive) {
        while (motorData.isTripActive) {
            delay(1000L)
            displaySeconds++
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BladeColors.Background),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "TRIP",
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = BladeColors.Gray,
            letterSpacing = 2.sp
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = formatTime(displaySeconds),
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = BladeColors.White
        )

        Spacer(modifier = Modifier.height(4.dp))

        if (motorData.isTripActive) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(BladeColors.Error)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Recording",
                    fontSize = 11.sp,
                    color = BladeColors.Error
                )
            }
        } else {
            Text(
                text = "Ready",
                fontSize = 11.sp,
                color = BladeColors.Gray
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = {
                coroutineScope.launch {
                    if (motorData.isTripActive) {
                        PhoneMessageClient.sendTripCommand(context, "stop")
                    } else {
                        PhoneMessageClient.sendTripCommand(context, "start")
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth(0.8f)
                .height(44.dp),
            colors = ButtonDefaults.buttonColors(
                backgroundColor = if (motorData.isTripActive) BladeColors.Error else BladeColors.Marine
            ),
            shape = RoundedCornerShape(10.dp),
            enabled = motorData.isConnected
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = if (motorData.isTripActive) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                    contentDescription = if (motorData.isTripActive) "Stop" else "Start",
                    modifier = Modifier.size(16.dp),
                    tint = BladeColors.White
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = if (motorData.isTripActive) "End Trip" else "Start Trip",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = BladeColors.White
                )
            }
        }

        if (!motorData.isConnected) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Connect motor to start",
                fontSize = 9.sp,
                color = BladeColors.Error.copy(alpha = 0.7f)
            )
        }
    }
}

private fun formatTime(totalSeconds: Int): String {
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return String.format("%02d:%02d:%02d", hours, minutes, seconds)
}
