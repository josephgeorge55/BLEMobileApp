package com.bladetcg.wearos.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.Text
import com.bladetcg.wearos.R
import com.bladetcg.wearos.data.MotorState
import com.bladetcg.wearos.presentation.theme.BladeColors

@Composable
fun HomeScreen() {
    val motorData by MotorState.motorData.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BladeColors.Background),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(if (motorData.isConnected) BladeColors.Success else BladeColors.Error)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = if (motorData.isConnected) "Connected" else "Disconnected",
                fontSize = 12.sp,
                color = if (motorData.isConnected) BladeColors.Success else BladeColors.Error
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Icon(
            painter = painterResource(id = R.drawable.ic_blade_icon),
            contentDescription = "Blade Icon",
            modifier = Modifier.size(36.dp),
            tint = BladeColors.Accent
        )

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = "Blade Outboards",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = BladeColors.White
        )

        Text(
            text = motorData.motorName,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = BladeColors.Marine
        )

        Spacer(modifier = Modifier.height(8.dp))

        Column(
            modifier = Modifier
                .background(
                    color = BladeColors.CardBg,
                    shape = RoundedCornerShape(8.dp)
                )
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Serial Number",
                fontSize = 10.sp,
                color = BladeColors.Gray
            )
            Text(
                text = motorData.serialNumber,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace,
                color = BladeColors.White
            )
        }
    }
}
