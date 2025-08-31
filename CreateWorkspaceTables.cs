using Microsoft.Data.Sqlite;
using System;
using System.IO;

namespace CreateWorkspaceTables
{
    class Program
    {
        static void Main(string[] args)
        {
            string dbPath = @"c:\Code\Cortex\backend\Data\cortex.db";
            string sqlScript = File.ReadAllText(@"c:\Code\Cortex\create_workspace_tables.sql");
            
            using var connection = new SqliteConnection($"Data Source={dbPath}");
            connection.Open();
            
            var statements = sqlScript.Split(';', StringSplitOptions.RemoveEmptyEntries);
            
            foreach (var statement in statements)
            {
                var trimmed = statement.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith("--"))
                    continue;
                    
                try
                {
                    using var command = connection.CreateCommand();
                    command.CommandText = trimmed;
                    command.ExecuteNonQuery();
                    Console.WriteLine($"Executed: {trimmed.Substring(0, Math.Min(50, trimmed.Length))}...");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error executing: {trimmed.Substring(0, Math.Min(50, trimmed.Length))}...");
                    Console.WriteLine($"Error: {ex.Message}");
                }
            }
            
            Console.WriteLine("Workspace tables creation completed!");
        }
    }
}
