import SwiftUI

struct ContentView: View {
    @EnvironmentObject var connectivity: WatchConnectivityManager
    
    var body: some View {
        TabView {
            HomeView()
            TelemetryView()
            TripView()
        }
        .tabViewStyle(.page)
    }
}
