package com.bladetcg.wearos.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Battery4Bar
import androidx.compose.material.icons.filled.Battery2Bar
import androidx.compose.material.icons.filled.Battery1Bar
import androidx.compose.material.icons.filled.Bolt
import com.bladetcg.wearos.data.MotorState
import com.bladetcg.wearos.presentation.theme.BladeColors

@Composable
fun TelemetryScreen() {
    val motorData by MotorState.motorData.collectAsState()

    val batteryColor = when {
        motorData.batteryPercent > 50 -> BladeColors.Success
        motorData.batteryPercent > 20 -> BladeColors.Warning
        else -> BladeColors.Error
    }

    val batteryIcon = when {
        motorData.batteryPercent > 75 -> Icons.Filled.BatteryFull
        motorData.batteryPercent > 50 -> Icons.Filled.Battery4Bar
        motorData.batteryPercent > 25 -> Icons.Filled.Battery2Bar
        else -> Icons.Filled.Battery1Bar
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BladeColors.Background),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "TELEMETRY",
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = BladeColors.Gray,
            letterSpacing = 2.sp
        )

        Spacer(modifier = Modifier.height(4.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Filled.LocationOn,
                contentDescription = "Speed",
                modifier = Modifier.size(12.dp),
                tint = BladeColors.Marine
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "SPEED",
                fontSize = 9.sp,
                fontWeight = FontWeight.SemiBold,
                color = BladeColors.Gray
            )
        }

        Text(
            text = String.format("%.1f", motorData.speedKnots),
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = BladeColors.White
        )

        Text(
            text = "knots",
            fontSize = 10.sp,
            color = BladeColors.Gray
        )

        Spacer(modifier = Modifier.height(4.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth(0.7f)
                .height(1.dp)
                .background(Color.White.copy(alpha = 0.2f))
        )

        Spacer(modifier = Modifier.height(6.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = batteryIcon,
                    contentDescription = "Battery",
                    modifier = Modifier.size(16.dp),
                    tint = batteryColor
                )
                Text(
                    text = "${motorData.batteryPercent}%",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = batteryColor
                )
                Text(
                    text = "Battery",
                    fontSize = 9.sp,
                    color = BladeColors.Gray
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Filled.Bolt,
                    contentDescription = "Power",
                    modifier = Modifier.size(16.dp),
                    tint = Color.Yellow
                )
                Text(
                    text = String.format("%.1f", motorData.wattage / 1000.0),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = BladeColors.White
                )
                Text(
                    text = "kW",
                    fontSize = 9.sp,
                    color = BladeColors.Gray
                )
            }
        }

        if (!motorData.isConnected) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "No motor connected",
                fontSize = 9.sp,
                color = BladeColors.Error.copy(alpha = 0.7f)
            )
        }
    }
}
