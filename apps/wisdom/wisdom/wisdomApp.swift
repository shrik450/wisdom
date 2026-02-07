//
//  wisdomApp.swift
//  wisdom
//
//  Created by Shrikanth Upadhayaya on 06/02/2026.
//

import SwiftUI

@main
struct wisdomApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .task {
                    await model.bootstrap()
                }
        }
    }
}
