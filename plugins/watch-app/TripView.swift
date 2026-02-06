import SwiftUI

struct TripView: View {
    @EnvironmentObject var connectivity: WatchConnectivityManager
    @State private var timer: Timer? = nil
    @State private var displaySeconds: Int = 0
    
    var body: some View {
        VStack(spacing: 8) {
            Text("TRIP")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.gray)
                .tracking(2)
            
            Spacer().frame(height: 4)
            
            Text(formatTime(displaySeconds))
                .font(.system(size: 32, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
            
            if connectivity.isTripActive {
                HStack(spacing: 4) {
                    Circle()
                        .fill(.red)
                        .frame(width: 8, height: 8)
                    Text("Recording")
                        .font(.system(size: 11))
                        .foregroundColor(.red)
                }
            } else {
                Text("Ready")
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
            }
            
            Spacer().frame(height: 8)
            
            Button(action: {
                if connectivity.isTripActive {
                    connectivity.sendTripCommand("stop")
                } else {
                    connectivity.sendTripCommand("start")
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: connectivity.isTripActive ? "stop.fill" : "play.fill")
                        .font(.system(size: 14))
                    Text(connectivity.isTripActive ? "End Trip" : "Start Trip")
                        .font(.system(size: 14, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(connectivity.isTripActive ? Color.red : Color(red: 10/255, green: 77/255, blue: 110/255))
                .foregroundColor(.white)
                .cornerRadius(10)
            }
            .buttonStyle(.plain)
            .disabled(!connectivity.isConnected)
            .opacity(connectivity.isConnected ? 1.0 : 0.4)
            
            if !connectivity.isConnected {
                Text("Connect motor to start")
                    .font(.system(size: 9))
                    .foregroundColor(.red.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 10/255, green: 22/255, blue: 40/255))
        .onAppear {
            startTimer()
        }
        .onDisappear {
            stopTimer()
        }
        .onChange(of: connectivity.isTripActive) { active in
            if !active {
                displaySeconds = 0
            }
        }
        .onChange(of: connectivity.tripElapsedSeconds) { newValue in
            displaySeconds = newValue
        }
    }
    
    func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            if connectivity.isTripActive {
                displaySeconds += 1
            }
        }
    }
    
    func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
    
    func formatTime(_ totalSeconds: Int) -> String {
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
}
