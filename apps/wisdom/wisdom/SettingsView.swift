import SwiftUI

struct SettingsView: View {
    @AppStorage("server_base_url") private var serverBaseURL = "http://localhost:8080"
    @AppStorage("server_username") private var username = ""
    @AppStorage("server_password") private var password = ""

    let onCheckConnection: () async -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Base URL", text: $serverBaseURL)
                        .wisdomInputFieldStyle()

                    TextField("Username", text: $username)
                        .wisdomInputFieldStyle()

                    SecureField("Password", text: $password)
                }

                Section {
                    Button("Check Connection") {
                        Task {
                            await onCheckConnection()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

private extension View {
    @ViewBuilder
    func wisdomInputFieldStyle() -> some View {
#if os(iOS) || os(visionOS)
        self
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
#else
        self
#endif
    }
}

#Preview {
    SettingsView {
    }
}
