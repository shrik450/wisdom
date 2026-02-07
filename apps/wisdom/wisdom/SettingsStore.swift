import Foundation

struct SettingsStore {
    private enum Keys {
        static let serverBaseURL = "server_base_url"
        static let username = "server_username"
        static let password = "server_password"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var serverBaseURL: String {
        defaults.string(forKey: Keys.serverBaseURL) ?? "http://localhost:8080"
    }

    var username: String {
        defaults.string(forKey: Keys.username) ?? ""
    }

    var password: String {
        defaults.string(forKey: Keys.password) ?? ""
    }
}
