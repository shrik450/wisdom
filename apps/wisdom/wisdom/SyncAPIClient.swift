import Foundation

struct SyncAPIClient {
    struct BasicCredentials {
        let username: String
        let password: String

        var authorizationValue: String {
            let joined = "\(username):\(password)"
            let token = Data(joined.utf8).base64EncodedString()
            return "Basic \(token)"
        }
    }

    enum Error: LocalizedError {
        case invalidResponse
        case httpStatus(Int)

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "Invalid server response"
            case .httpStatus(let status):
                return "Server returned HTTP \(status)"
            }
        }
    }

    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func healthCheck(baseURL: URL, credentials: BasicCredentials?) async throws {
        let endpoint = baseURL.appending(path: "healthz")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"

        if let credentials {
            request.setValue(credentials.authorizationValue, forHTTPHeaderField: "Authorization")
        }

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw Error.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw Error.httpStatus(httpResponse.statusCode)
        }
    }
}
