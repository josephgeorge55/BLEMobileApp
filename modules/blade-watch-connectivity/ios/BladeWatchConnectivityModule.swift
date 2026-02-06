import ExpoModulesCore
import WatchConnectivity

class WatchSessionDelegate: NSObject, WCSessionDelegate {
    weak var module: BladeWatchConnectivityModule?
    
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    
    func sessionDidBecomeInactive(_ session: WCSession) {}
    
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        if let command = message["tripCommand"] as? String {
            module?.sendEvent("onWatchTripCommand", ["command": command])
        }
    }
}

public class BladeWatchConnectivityModule: Module {
    private var session: WCSession?
    private var sessionDelegate: WatchSessionDelegate?
    
    public func definition() -> ModuleDefinition {
        Name("BladeWatchConnectivity")
        
        Events("onWatchTripCommand")
        
        OnCreate {
            if WCSession.isSupported() {
                self.sessionDelegate = WatchSessionDelegate()
                self.sessionDelegate?.module = self
                self.session = WCSession.default
                self.session?.delegate = self.sessionDelegate
                self.session?.activate()
            }
        }
        
        AsyncFunction("activateSession") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            if self.session == nil {
                self.sessionDelegate = WatchSessionDelegate()
                self.sessionDelegate?.module = self
                self.session = WCSession.default
                self.session?.delegate = self.sessionDelegate
            }
            self.session?.activate()
            return true
        }
        
        AsyncFunction("sendTelemetryToWatch") { (isConnected: Bool, serialNumber: String, motorName: String, speedKnots: Double, batteryPercent: Int, wattage: Double, isTripActive: Bool, tripElapsedSeconds: Int) -> Bool in
            guard let session = self.session, session.isPaired, session.isWatchAppInstalled else {
                return false
            }
            
            let context: [String: Any] = [
                "isConnected": isConnected,
                "serialNumber": serialNumber,
                "motorName": motorName,
                "speedKnots": speedKnots,
                "batteryPercent": batteryPercent,
                "wattage": wattage,
                "isTripActive": isTripActive,
                "tripElapsedSeconds": tripElapsedSeconds,
                "tripStartTime": isTripActive ? Date().timeIntervalSince1970 : 0
            ]
            
            do {
                try session.updateApplicationContext(context)
                if session.isReachable {
                    session.sendMessage(context, replyHandler: nil, errorHandler: nil)
                }
                return true
            } catch {
                return false
            }
        }
        
        AsyncFunction("isWatchPaired") { () -> Bool in
            return self.session?.isPaired ?? false
        }
        
        AsyncFunction("isWatchReachable") { () -> Bool in
            return self.session?.isReachable ?? false
        }
    }
}
