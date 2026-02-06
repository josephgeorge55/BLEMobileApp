import ActivityKit
import Foundation

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
