import WidgetKit
import SwiftUI
import ActivityKit

@available(iOS 16.2, *)
struct BladeOutboardsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BladeOutboardsAttributes.self) { context in
            lockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: -2) {
                        Text("BLADE")
                            .font(.system(size: 12, weight: .black))
                            .italic()
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 4) {
                        Image(systemName: batteryIconName(percent: context.state.batteryPercent))
                            .foregroundColor(batteryColor(percent: context.state.batteryPercent))
                            .font(.caption2)
                        Text("\(context.state.batteryPercent)%")
                            .font(.caption2)
                            .bold()
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("SN: \(context.state.serialNumber)")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        HStack(spacing: 3) {
                            Image(systemName: "bolt.fill")
                                .foregroundColor(.yellow)
                                .font(.caption2)
                            Text(String(format: "%.1f kW", context.state.wattageKW))
                                .font(.caption2)
                                .foregroundColor(.white)
                        }
                        Spacer()
                        if context.state.isRecording {
                            HStack(spacing: 3) {
                                Circle()
                                    .fill(.red)
                                    .frame(width: 6, height: 6)
                                Text("REC \(context.state.tripDuration)")
                                    .font(.caption2)
                                    .foregroundColor(.white)
                            }
                        } else {
                            Text("Connected")
                                .font(.caption2)
                                .foregroundColor(.green)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "bolt.fill")
                    .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
            } compactTrailing: {
                Text("\(context.state.batteryPercent)%")
                    .font(.caption2)
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "bolt.fill")
                    .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
            }
        }
    }

    @ViewBuilder
    func lockScreenView(context: ActivityViewContext<BladeOutboardsAttributes>) -> some View {
        VStack(spacing: 8) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("BLADE")
                        .font(.system(size: 18, weight: .black))
                        .italic()
                        .foregroundColor(.white)
                    Text("OUTBOARDS")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.white.opacity(0.8))
                        .tracking(1.5)
                }

                Spacer()

                Text("SN: \(context.state.serialNumber)")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.5))
            }

            HStack(spacing: 0) {
                HStack(spacing: 4) {
                    Image(systemName: "bolt.fill")
                        .foregroundColor(.yellow)
                        .font(.subheadline)
                    Text(String(format: "%.1f kW", context.state.wattageKW))
                        .font(.subheadline)
                        .bold()
                        .foregroundColor(.white)
                }

                Spacer()

                HStack(spacing: 5) {
                    Image(systemName: batteryIconName(percent: context.state.batteryPercent))
                        .foregroundColor(batteryColor(percent: context.state.batteryPercent))
                        .font(.caption)
                    Text("\(context.state.batteryPercent)%")
                        .font(.subheadline)
                        .bold()
                        .foregroundColor(.white)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color.white.opacity(0.15))
                                .frame(height: 4)
                            RoundedRectangle(cornerRadius: 2)
                                .fill(batteryColor(percent: context.state.batteryPercent))
                                .frame(width: geo.size.width * CGFloat(context.state.batteryPercent) / 100.0, height: 4)
                        }
                    }
                    .frame(width: 32, height: 4)
                }
            }

            HStack {
                if context.state.isRecording {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(.red)
                            .frame(width: 8, height: 8)
                        Text("Recording")
                            .font(.caption)
                            .foregroundColor(.red)
                        Text(context.state.tripDuration)
                            .font(.caption)
                            .bold()
                            .foregroundColor(.white)
                    }
                } else {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(.green)
                            .frame(width: 8, height: 8)
                        Text("Connected")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                }
                Spacer()
            }

            if context.state.isRecording {
                Link(destination: URL(string: "bladeoutboards://trip/stop")!) {
                    HStack {
                        Spacer()
                        Image(systemName: "stop.fill")
                            .font(.caption)
                        Text("Stop Trip")
                            .font(.caption)
                            .bold()
                        Spacer()
                    }
                    .padding(.vertical, 6)
                    .background(Color.red.opacity(0.8))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
            } else {
                Link(destination: URL(string: "bladeoutboards://trip/start")!) {
                    HStack {
                        Spacer()
                        Image(systemName: "play.fill")
                            .font(.caption)
                        Text("Start Trip")
                            .font(.caption)
                            .bold()
                        Spacer()
                    }
                    .padding(.vertical, 6)
                    .background(Color(red: 10/255, green: 77/255, blue: 110/255))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(red: 10/255, green: 22/255, blue: 40/255))
    }

    func batteryColor(percent: Int) -> Color {
        if percent > 50 {
            return .green
        } else if percent > 20 {
            return .yellow
        } else {
            return .red
        }
    }

    func batteryIconName(percent: Int) -> String {
        if percent > 75 {
            return "battery.100"
        } else if percent > 50 {
            return "battery.75"
        } else if percent > 25 {
            return "battery.50"
        } else {
            return "battery.25"
        }
    }
}

@main
struct BladeOutboardsWidgetBundle: WidgetBundle {
    var body: some Widget {
        BladeOutboardsLiveActivity()
    }
}
