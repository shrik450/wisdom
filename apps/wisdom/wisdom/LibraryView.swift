import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section("Server") {
                    HStack {
                        Text("Connection")
                        Spacer()
                        Text(connectionLabel)
                            .foregroundStyle(connectionColor)
                    }
                }

                Section("Local") {
                    switch model.databaseState {
                    case .idle:
                        Text("Database not initialized")
                    case .ready(let path):
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SQLite ready")
                            Text(path)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    case .failed(let message):
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Database init failed")
                            Text(message)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Wisdom")
        }
    }

    private var connectionLabel: String {
        switch model.connectionState {
        case .idle:
            return "Idle"
        case .checking:
            return "Checking"
        case .connected:
            return "Connected"
        case .disconnected:
            return "Disconnected"
        }
    }

    private var connectionColor: Color {
        switch model.connectionState {
        case .connected:
            return .green
        case .checking:
            return .orange
        case .idle, .disconnected:
            return .red
        }
    }
}

#Preview {
    LibraryView()
        .environmentObject(AppModel())
}
