import SwiftUI

struct NotesView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "No Notes Yet",
                systemImage: "square.and.pencil",
                description: Text("Notes and journals will appear here once sync is wired.")
            )
            .navigationTitle("Notes")
        }
    }
}

#Preview {
    NotesView()
}
