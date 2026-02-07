import ExpoModulesCore

#if canImport(ActivityKit)
import ActivityKit
#endif

@available(iOS 16.2, *)
struct BladeOutboardsAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var serialNumber: String
        var wattageKW: Double
        var batteryPercent: Int
        var isRecording: Bool
        var tripDuration: String
    }

    var motorName: String
}

public class BladeLiveActivityModule: Module {
    var currentActivityId: String?

    public func definition() -> ModuleDefinition {
        Name("BladeLiveActivity")

        AsyncFunction("startLiveActivity") { (serialNumber: String, wattageKW: Double, batteryPercent: Int, isRecording: Bool, tripDuration: String) -> String in
            #if canImport(ActivityKit)
            guard #available(iOS 16.2, *) else {
                throw NSError(domain: "BladeLiveActivity", code: 1, userInfo: [NSLocalizedDescriptionKey: "Live Activities require iOS 16.2 or later"])
            }

            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                throw NSError(domain: "BladeLiveActivity", code: 3, userInfo: [NSLocalizedDescriptionKey: "Live Activities are not enabled on this device. Please enable them in Settings > Blade Outboards > Live Activities."])
            }

            let attributes = BladeOutboardsAttributes(motorName: "Blade Outboard")
            let state = BladeOutboardsAttributes.ContentState(
                serialNumber: serialNumber,
                wattageKW: wattageKW,
                batteryPercent: batteryPercent,
                isRecording: isRecording,
                tripDuration: tripDuration
            )

            do {
                let activity = try Activity<BladeOutboardsAttributes>.request(
                    attributes: attributes,
                    content: .init(state: state, staleDate: nil),
                    pushType: nil
                )
                self.currentActivityId = activity.id
                return activity.id
            } catch {
                throw NSError(domain: "BladeLiveActivity", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to start Live Activity: \(error.localizedDescription)"])
            }
            #else
            throw NSError(domain: "BladeLiveActivity", code: 4, userInfo: [NSLocalizedDescriptionKey: "ActivityKit is not available on this platform"])
            #endif
        }

        AsyncFunction("updateLiveActivity") { (serialNumber: String, wattageKW: Double, batteryPercent: Int, isRecording: Bool, tripDuration: String) -> Bool in
            #if canImport(ActivityKit)
            guard #available(iOS 16.2, *) else {
                return false
            }

            let state = BladeOutboardsAttributes.ContentState(
                serialNumber: serialNumber,
                wattageKW: wattageKW,
                batteryPercent: batteryPercent,
                isRecording: isRecording,
                tripDuration: tripDuration
            )

            for activity in Activity<BladeOutboardsAttributes>.activities {
                await activity.update(ActivityContent<BladeOutboardsAttributes.ContentState>(state: state, staleDate: nil))
            }
            return true
            #else
            return false
            #endif
        }

        AsyncFunction("endLiveActivity") { () -> Bool in
            #if canImport(ActivityKit)
            guard #available(iOS 16.2, *) else {
                return false
            }

            for activity in Activity<BladeOutboardsAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.currentActivityId = nil
            return true
            #else
            return false
            #endif
        }

        AsyncFunction("isLiveActivitySupported") { () -> Bool in
            #if canImport(ActivityKit)
            guard #available(iOS 16.2, *) else {
                return false
            }
            return ActivityAuthorizationInfo().areActivitiesEnabled
            #else
            return false
            #endif
        }
    }
}
