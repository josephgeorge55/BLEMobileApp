import ExpoModulesCore
import ActivityKit

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
            guard #available(iOS 16.2, *) else {
                throw NSError(domain: "BladeLiveActivity", code: 1, userInfo: [NSLocalizedDescriptionKey: "Live Activities require iOS 16.2 or later"])
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
                throw NSError(domain: "BladeLiveActivity", code: 2, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription])
            }
        }

        AsyncFunction("updateLiveActivity") { (serialNumber: String, wattageKW: Double, batteryPercent: Int, isRecording: Bool, tripDuration: String) -> Bool in
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
        }

        AsyncFunction("endLiveActivity") { () -> Bool in
            guard #available(iOS 16.2, *) else {
                return false
            }

            for activity in Activity<BladeOutboardsAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            self.currentActivityId = nil
            return true
        }

        AsyncFunction("isLiveActivitySupported") { () -> Bool in
            guard #available(iOS 16.2, *) else {
                return false
            }
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }
    }
}
