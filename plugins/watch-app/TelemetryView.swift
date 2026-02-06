import SwiftUI

struct TelemetryView: View {
    @EnvironmentObject var connectivity: WatchConnectivityManager
    
    var body: some View {
        VStack(spacing: 6) {
            Text("TELEMETRY")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.gray)
                .tracking(2)
            
            Spacer().frame(height: 2)
            
            VStack(spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "location.fill")
                        .font(.system(size: 10))
                        .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
                    Text("SPEED")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.gray)
                }
                Text(String(format: "%.1f", connectivity.speedKnots))
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("knots")
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
            }
            
            Divider()
                .background(Color.white.opacity(0.2))
                .padding(.horizontal, 20)
            
            HStack(spacing: 16) {
                VStack(spacing: 2) {
                    Image(systemName: batteryIconName)
                        .font(.system(size: 14))
                        .foregroundColor(batteryColor)
                    Text("\(connectivity.batteryPercent)%")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(batteryColor)
                    Text("Battery")
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }
                
                VStack(spacing: 2) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 14))
                        .foregroundColor(.yellow)
                    Text(String(format: "%.1f", connectivity.wattage / 1000.0))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Text("kW")
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }
            }
            
            if !connectivity.isConnected {
                Text("No motor connected")
                    .font(.system(size: 9))
                    .foregroundColor(.red.opacity(0.7))
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 10/255, green: 22/255, blue: 40/255))
    }
    
    var batteryColor: Color {
        if connectivity.batteryPercent > 50 { return .green }
        else if connectivity.batteryPercent > 20 { return .yellow }
        else { return .red }
    }
    
    var batteryIconName: String {
        if connectivity.batteryPercent > 75 { return "battery.100" }
        else if connectivity.batteryPercent > 50 { return "battery.75" }
        else if connectivity.batteryPercent > 25 { return "battery.50" }
        else { return "battery.25" }
    }
}
