using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CortexApi.Migrations
{
    /// <inheritdoc />
    public partial class AddGamificationFieldsToUserProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TotalNotes",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TotalSearches",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TotalLogins",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "LoginStreak",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastStreakDate",
                table: "UserProfiles",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TotalTimeSpentMinutes",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ExperiencePoints",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Level",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TotalNotes",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalSearches",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalLogins",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "LoginStreak",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "LastStreakDate",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalTimeSpentMinutes",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "ExperiencePoints",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "UserProfiles");
        }
    }
}
