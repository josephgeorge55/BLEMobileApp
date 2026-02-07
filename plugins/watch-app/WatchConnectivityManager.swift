import Foundation
import WatchConnectivity

class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    @Published var isConnected: Bool = false
    @Published var serialNumber: String = "--"
    @Published var motorName: String = "Blade Halo"
    @Published var speedKnots: Double = 0.0
    @Published var batteryPercent: Int = 0
    @Published var wattage: Double = 0.0
    @Published var isTripActive: Bool = false
    @Published var tripStartTime: Date? = nil
    @Published var tripElapsedSeconds: Int = 0
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }
    
    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    #endif
    
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated {
            let context = session.receivedApplicationContext
            if !context.isEmpty {
                DispatchQueue.main.async {
                    self.updateFromContext(context)
                }
            }
        }
    }
    
    func sessionReachabilityDidChange(_ session: WCSession) {
        if !session.isReachable {
            DispatchQueue.main.async {
                self.isConnected = false
            }
        }
    }
    
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        DispatchQueue.main.async {
            self.updateFromContext(applicationContext)
        }
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        DispatchQueue.main.async {
            self.updateFromContext(message)
        }
    }
    
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any] = [:]) {
        DispatchQueue.main.async {
            self.updateFromContext(userInfo)
        }
    }
    
    private func updateFromContext(_ data: [String: Any]) {
        if let connected = data["isConnected"] as? Bool {
            self.isConnected = connected
        }
        if let serial = data["serialNumber"] as? String {
            self.serialNumber = serial
        }
        if let motor = data["motorName"] as? String {
            self.motorName = motor
        }
        if let speed = data["speedKnots"] as? Double {
            self.speedKnots = speed
        }
        if let battery = data["batteryPercent"] as? Int {
            self.batteryPercent = battery
        }
        if let watts = data["wattage"] as? Double {
            self.wattage = watts
        }
        if let tripActive = data["isTripActive"] as? Bool {
            self.isTripActive = tripActive
        }
        if let elapsed = data["tripElapsedSeconds"] as? Int {
            self.tripElapsedSeconds = elapsed
        }
        if let startTime = data["tripStartTime"] as? Double {
            self.tripStartTime = Date(timeIntervalSince1970: startTime)
        }
    }
    
    func sendTripCommand(_ command: String) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["tripCommand": command], replyHandler: nil) { error in
            print("Watch: Failed to send trip command: \(error.localizedDescription)")
        }
    }
}
