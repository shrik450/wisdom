//
//  ContentView.swift
//  wisdom
//
//  Created by Shrikanth Upadhayaya on 06/02/2026.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView {
            LibraryView()
                .tabItem {
                    Label("Library", systemImage: "books.vertical")
                }

            NotesView()
                .tabItem {
                    Label("Notes", systemImage: "note.text")
                }

            SettingsView {
                await model.checkConnection()
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AppModel())
}
