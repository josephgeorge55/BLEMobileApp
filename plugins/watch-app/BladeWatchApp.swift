import SwiftUI

@main
struct BladeWatchApp: App {
    @StateObject private var connectivity = WatchConnectivityManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connectivity)
        }
    }
}
