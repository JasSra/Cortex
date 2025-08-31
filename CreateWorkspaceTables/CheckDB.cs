using Microsoft.Data.Sqlite;
using System;

namespace CheckDB
{
    class Program
    {
        static void Main(string[] args)
        {
            string dbPath = @"c:\Code\Cortex\backend\Data\cortex.db";
            
            using var connection = new SqliteConnection($"Data Source={dbPath}");
            connection.Open();
            
            // Check what tables exist
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;";
            
            Console.WriteLine("Existing tables:");
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                Console.WriteLine($"- {reader.GetString(0)}");
            }
            reader.Close();
            
            // Try to create the UserWorkspaces table
            try
            {
                using var createCmd = connection.CreateCommand();
                createCmd.CommandText = @"
                    CREATE TABLE UserWorkspaces (
                        Id TEXT NOT NULL PRIMARY KEY,
                        UserId TEXT NOT NULL,
                        ActiveNoteId TEXT NULL,
                        RecentNoteIds TEXT NULL,
                        EditorState TEXT NULL,
                        PinnedTags TEXT NULL,
                        LayoutPreferences TEXT NULL,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );";
                createCmd.ExecuteNonQuery();
                Console.WriteLine("UserWorkspaces table created successfully!");
                
                // Add unique index
                createCmd.CommandText = "CREATE UNIQUE INDEX IX_UserWorkspaces_UserId ON UserWorkspaces (UserId);";
                createCmd.ExecuteNonQuery();
                Console.WriteLine("UserWorkspaces index created!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating UserWorkspaces: {ex.Message}");
            }
            
            // Try to create the UserNoteAccess table
            try
            {
                using var createCmd = connection.CreateCommand();
                createCmd.CommandText = @"
                    CREATE TABLE UserNoteAccess (
                        Id TEXT NOT NULL PRIMARY KEY,
                        UserId TEXT NOT NULL,
                        NoteId TEXT NOT NULL,
                        AccessType TEXT NOT NULL,
                        DurationSeconds INTEGER NOT NULL,
                        EditorStateSnapshot TEXT NULL,
                        AccessedAt TEXT NOT NULL
                    );";
                createCmd.ExecuteNonQuery();
                Console.WriteLine("UserNoteAccess table created successfully!");
                
                // Add indexes
                createCmd.CommandText = "CREATE INDEX IX_UserNoteAccess_UserId ON UserNoteAccess (UserId);";
                createCmd.ExecuteNonQuery();
                createCmd.CommandText = "CREATE INDEX IX_UserNoteAccess_NoteId ON UserNoteAccess (NoteId);";
                createCmd.ExecuteNonQuery();
                createCmd.CommandText = "CREATE INDEX IX_UserNoteAccess_AccessedAt ON UserNoteAccess (AccessedAt);";
                createCmd.ExecuteNonQuery();
                Console.WriteLine("UserNoteAccess indexes created!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating UserNoteAccess: {ex.Message}");
            }
        }
    }
}
