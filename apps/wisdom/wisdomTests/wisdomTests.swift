//
//  wisdomTests.swift
//  wisdomTests
//
//  Created by Shrikanth Upadhayaya on 06/02/2026.
//

import Foundation
import XCTest
@testable import wisdom

final class wisdomTests: XCTestCase {

    @MainActor
    func testDefaultServerURL() {
        let suiteName = "wisdom-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)
        XCTAssertNotNil(defaults)

        let store = SettingsStore(defaults: defaults!)
        XCTAssertEqual(store.serverBaseURL, "http://localhost:8080")

        defaults?.removePersistentDomain(forName: suiteName)
    }

}
