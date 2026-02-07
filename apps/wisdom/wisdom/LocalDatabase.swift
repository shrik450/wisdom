import Foundation
import GRDB

final class LocalDatabase {
    let queue: DatabaseQueue
    let url: URL

    private init(queue: DatabaseQueue, url: URL) {
        self.queue = queue
        self.url = url
    }

    static func bootstrap(fileManager: FileManager = .default) throws -> LocalDatabase {
        let appSupportURL = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let directoryURL = appSupportURL.appendingPathComponent("Wisdom", isDirectory: true)
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)

        let databaseURL = directoryURL.appendingPathComponent("wisdom.sqlite", isDirectory: false)
        var configuration = Configuration()
        configuration.foreignKeysEnabled = true

        let queue = try DatabaseQueue(path: databaseURL.path(), configuration: configuration)

        var migrator = DatabaseMigrator()
        migrator.registerMigration("v1_initial") { db in
            try db.create(table: "local_documents") { table in
                table.column("doc_id", .text).primaryKey()
                table.column("relative_path", .text).notNull()
                table.column("adapter", .text).notNull()
                table.column("updated_at", .datetime).notNull()
            }

            try db.create(table: "local_sync_state") { table in
                table.column("id", .integer).primaryKey()
                table.column("last_cursor", .integer).notNull().defaults(to: 0)
            }

            try db.execute(sql: "INSERT INTO local_sync_state (id, last_cursor) VALUES (1, 0)")
        }

        try migrator.migrate(queue)
        return LocalDatabase(queue: queue, url: databaseURL)
    }
}
