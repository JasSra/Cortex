using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CortexApi.Migrations
{
    /// <inheritdoc />
    public partial class AddConfigurationSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConfigurationSettings",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Key = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false),
                    ValueType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Section = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    IsSensitive = table.Column<bool>(type: "INTEGER", nullable: false),
                    RequiresRestart = table.Column<bool>(type: "INTEGER", nullable: false),
                    DefaultValue = table.Column<string>(type: "TEXT", nullable: false),
                    ValidationRules = table.Column<string>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConfigurationSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConfigurationSettings_Key",
                table: "ConfigurationSettings",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConfigurationSettings_Section",
                table: "ConfigurationSettings",
                column: "Section");

            migrationBuilder.CreateIndex(
                name: "IX_ConfigurationSettings_SortOrder",
                table: "ConfigurationSettings",
                column: "SortOrder");

            migrationBuilder.CreateIndex(
                name: "IX_ConfigurationSettings_UpdatedAt",
                table: "ConfigurationSettings",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConfigurationSettings");
        }
    }
}
