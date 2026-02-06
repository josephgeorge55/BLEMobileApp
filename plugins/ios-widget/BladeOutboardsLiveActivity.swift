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
                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
                        Text("SN: \(context.state.serialNumber)")
                            .font(.caption)
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 4) {
                        Image(systemName: batteryIconName(percent: context.state.batteryPercent))
                            .foregroundColor(batteryColor(percent: context.state.batteryPercent))
                        Text("\(context.state.batteryPercent)%")
                            .font(.caption)
                            .bold()
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("Blade Outboards")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.7))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        HStack(spacing: 4) {
                            Image(systemName: "bolt.fill")
                                .foregroundColor(.yellow)
                            Text(String(format: "%.1f kW", context.state.wattageKW))
                                .font(.caption)
                                .foregroundColor(.white)
                        }
                        Spacer()
                        if context.state.isRecording {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(.red)
                                    .frame(width: 8, height: 8)
                                Text("Recording \(context.state.tripDuration)")
                                    .font(.caption)
                                    .foregroundColor(.white)
                            }
                        } else {
                            Text("Connected")
                                .font(.caption)
                                .foregroundColor(.green)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "bolt.fill")
                    .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
            } compactTrailing: {
                Text("\(context.state.batteryPercent)%")
                    .font(.caption)
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: "bolt.fill")
                    .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
            }
        }
    }

    @ViewBuilder
    func lockScreenView(context: ActivityViewContext<BladeOutboardsAttributes>) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill")
                    .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
                Text("Blade Outboards")
                    .font(.headline)
                    .bold()
                    .foregroundColor(Color(red: 10/255, green: 77/255, blue: 110/255))
                Spacer()
            }

            HStack {
                Text("SN: \(context.state.serialNumber)")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
                Spacer()
            }

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "bolt.fill")
                        .foregroundColor(.yellow)
                    Text(String(format: "%.1f kW", context.state.wattageKW))
                        .font(.title3)
                        .bold()
                        .foregroundColor(.white)
                }

                Spacer()

                HStack(spacing: 6) {
                    Image(systemName: batteryIconName(percent: context.state.batteryPercent))
                        .foregroundColor(batteryColor(percent: context.state.batteryPercent))
                    Text("\(context.state.batteryPercent)%")
                        .font(.title3)
                        .bold()
                        .foregroundColor(.white)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.white.opacity(0.2))
                                .frame(height: 6)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(batteryColor(percent: context.state.batteryPercent))
                                .frame(width: geo.size.width * CGFloat(context.state.batteryPercent) / 100.0, height: 6)
                        }
                    }
                    .frame(width: 40, height: 6)
                }
            }

            HStack {
                if context.state.isRecording {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(.red)
                            .frame(width: 10, height: 10)
                        Text("Recording")
                            .font(.subheadline)
                            .foregroundColor(.red)
                        Text(context.state.tripDuration)
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                } else {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(.green)
                            .frame(width: 10, height: 10)
                        Text("Connected")
                            .font(.subheadline)
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
                        Text("Stop Trip")
                            .bold()
                        Spacer()
                    }
                    .padding(.vertical, 8)
                    .background(Color.red.opacity(0.8))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
            } else {
                Link(destination: URL(string: "bladeoutboards://trip/start")!) {
                    HStack {
                        Spacer()
                        Image(systemName: "play.fill")
                        Text("Start Trip")
                            .bold()
                        Spacer()
                    }
                    .padding(.vertical, 8)
                    .background(Color(red: 10/255, green: 77/255, blue: 110/255))
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
            }
        }
        .padding(16)
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

@available(iOS 16.2, *)
struct BladeOutboardsWidgetBundle: WidgetBundle {
    var body: some Widget {
        BladeOutboardsLiveActivity()
    }
}
