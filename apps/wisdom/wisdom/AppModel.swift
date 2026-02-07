import Foundation
import SwiftUI
import Combine

@MainActor
final class AppModel: ObservableObject {
    enum ConnectionState: Equatable {
        case idle
        case checking
        case connected
        case disconnected(String)
    }

    enum DatabaseState: Equatable {
        case idle
        case ready(String)
        case failed(String)
    }

    @Published private(set) var connectionState: ConnectionState = .idle
    @Published private(set) var databaseState: DatabaseState = .idle

    private let settingsStore: SettingsStore
    private let apiClient: SyncAPIClient
    private var localDatabase: LocalDatabase?

    init(settingsStore: SettingsStore, apiClient: SyncAPIClient) {
        self.settingsStore = settingsStore
        self.apiClient = apiClient
    }

    convenience init() {
        self.init(settingsStore: SettingsStore(), apiClient: SyncAPIClient())
    }

    func bootstrap() async {
        do {
            localDatabase = try LocalDatabase.bootstrap()
            databaseState = .ready(localDatabase?.url.path() ?? "")
        } catch {
            databaseState = .failed(error.localizedDescription)
        }

        await checkConnection()
    }

    func checkConnection() async {
        connectionState = .checking

        guard let baseURL = URL(string: settingsStore.serverBaseURL) else {
            connectionState = .disconnected("Invalid server URL")
            return
        }

        do {
            let credentials: SyncAPIClient.BasicCredentials?
            if settingsStore.username.isEmpty {
                credentials = nil
            } else {
                credentials = .init(username: settingsStore.username, password: settingsStore.password)
            }

            try await apiClient.healthCheck(baseURL: baseURL, credentials: credentials)
            connectionState = .connected
        } catch {
            connectionState = .disconnected(error.localizedDescription)
        }
    }
}
