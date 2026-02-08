import SwiftUI

struct HomeView: View {
    @EnvironmentObject var connectivity: WatchConnectivityManager
    
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(connectivity.isConnected ? Color.green : Color.red)
                    .frame(width: 10, height: 10)
                Text(connectivity.isConnected ? "Connected" : "Disconnected")
                    .font(.caption)
                    .foregroundColor(connectivity.isConnected ? .green : .red)
            }
            
            Spacer().frame(height: 4)
            
            Image("BladeIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 36, height: 36)
            
            Text("Blade Outboards")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
            
            Text(connectivity.motorName)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
            
            Spacer().frame(height: 8)
            
            VStack(spacing: 2) {
                Text("Serial Number")
                    .font(.system(size: 10))
                    .foregroundColor(.gray)
                Text(connectivity.serialNumber)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.1))
            .cornerRadius(8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 10/255, green: 22/255, blue: 40/255))
    }
}
