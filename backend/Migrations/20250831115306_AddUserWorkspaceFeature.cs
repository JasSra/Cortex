using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CortexApi.Migrations
{
    /// <inheritdoc />
    public partial class AddUserWorkspaceFeature : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Notes_Sha256Hash",
                table: "Notes");

            migrationBuilder.AddColumn<int>(
                name: "ExperiencePoints",
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
                name: "Level",
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

            migrationBuilder.AddColumn<int>(
                name: "TotalLogins",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

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
                name: "TotalTimeSpentMinutes",
                table: "UserProfiles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<string>(
                name: "EntityId",
                table: "TextSpans",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "TEXT");

            migrationBuilder.CreateTable(
                name: "Achievements",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Icon = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Points = table.Column<int>(type: "INTEGER", nullable: false),
                    IsHidden = table.Column<bool>(type: "INTEGER", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Criteria = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "{}"),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Achievements", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmbeddingCache",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    TextHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Provider = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Model = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Dim = table.Column<int>(type: "INTEGER", nullable: false),
                    VectorJson = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmbeddingCache", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "NotificationDevices",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserProfileId = table.Column<string>(type: "TEXT", nullable: false),
                    Endpoint = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    P256dh = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Auth = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    DeviceType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    DeviceName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    UserAgent = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    RegisteredAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastUsed = table.Column<DateTime>(type: "TEXT", nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotificationDevices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NotificationDevices_UserProfiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalTable: "UserProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NotificationHistory",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserProfileId = table.Column<string>(type: "TEXT", nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Message = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    DeliveryMethods = table.Column<string>(type: "TEXT", nullable: false, defaultValue: "[]"),
                    SentAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotificationHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NotificationHistory_UserProfiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalTable: "UserProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StoredFiles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    OriginalFileName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    StoredPath = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    RelativePath = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    Extension = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Tags = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoredFiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserNoteAccess",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    NoteId = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    AccessType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    DurationSeconds = table.Column<int>(type: "INTEGER", nullable: false),
                    EditorStateSnapshot = table.Column<string>(type: "TEXT", nullable: true),
                    AccessedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserNoteAccess", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserNoteAccess_Notes_NoteId",
                        column: x => x.NoteId,
                        principalTable: "Notes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserRoleAssignments",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    SubjectId = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRoleAssignments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserWorkspaces",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    ActiveNoteId = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    RecentNoteIds = table.Column<string>(type: "TEXT", nullable: false),
                    EditorState = table.Column<string>(type: "TEXT", nullable: false),
                    PinnedTags = table.Column<string>(type: "TEXT", nullable: false),
                    LayoutPreferences = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserWorkspaces", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserWorkspaces_Notes_ActiveNoteId",
                        column: x => x.ActiveNoteId,
                        principalTable: "Notes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "UserAchievements",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    UserProfileId = table.Column<string>(type: "TEXT", nullable: false),
                    AchievementId = table.Column<string>(type: "TEXT", nullable: false),
                    EarnedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Progress = table.Column<int>(type: "INTEGER", nullable: false),
                    HasSeen = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAchievements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserAchievements_Achievements_AchievementId",
                        column: x => x.AchievementId,
                        principalTable: "Achievements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserAchievements_UserProfiles_UserProfileId",
                        column: x => x.UserProfileId,
                        principalTable: "UserProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Notes_UserId_Sha256Hash",
                table: "Notes",
                columns: new[] { "UserId", "Sha256Hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NoteChunks_NoteId_Sha256",
                table: "NoteChunks",
                columns: new[] { "NoteId", "Sha256" });

            migrationBuilder.CreateIndex(
                name: "IX_Achievements_Category",
                table: "Achievements",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_Achievements_SortOrder",
                table: "Achievements",
                column: "SortOrder");

            migrationBuilder.CreateIndex(
                name: "IX_EmbeddingCache_CreatedAt",
                table: "EmbeddingCache",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_EmbeddingCache_TextHash_Provider_Model",
                table: "EmbeddingCache",
                columns: new[] { "TextHash", "Provider", "Model" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NotificationDevices_Endpoint",
                table: "NotificationDevices",
                column: "Endpoint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NotificationDevices_IsActive",
                table: "NotificationDevices",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationDevices_RegisteredAt",
                table: "NotificationDevices",
                column: "RegisteredAt");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationDevices_UserProfileId",
                table: "NotificationDevices",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationHistory_SentAt",
                table: "NotificationHistory",
                column: "SentAt");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationHistory_Status",
                table: "NotificationHistory",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationHistory_Type",
                table: "NotificationHistory",
                column: "Type");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationHistory_UserProfileId",
                table: "NotificationHistory",
                column: "UserProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_CreatedAt",
                table: "StoredFiles",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_StoredFiles_UserId",
                table: "StoredFiles",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAchievements_AchievementId",
                table: "UserAchievements",
                column: "AchievementId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAchievements_EarnedAt",
                table: "UserAchievements",
                column: "EarnedAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserAchievements_UserProfileId_AchievementId",
                table: "UserAchievements",
                columns: new[] { "UserProfileId", "AchievementId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserNoteAccess_AccessedAt",
                table: "UserNoteAccess",
                column: "AccessedAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserNoteAccess_NoteId",
                table: "UserNoteAccess",
                column: "NoteId");

            migrationBuilder.CreateIndex(
                name: "IX_UserNoteAccess_UserId_AccessedAt",
                table: "UserNoteAccess",
                columns: new[] { "UserId", "AccessedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_UserNoteAccess_UserId_NoteId",
                table: "UserNoteAccess",
                columns: new[] { "UserId", "NoteId" });

            migrationBuilder.CreateIndex(
                name: "IX_UserRoleAssignments_SubjectId_Role",
                table: "UserRoleAssignments",
                columns: new[] { "SubjectId", "Role" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserWorkspaces_ActiveNoteId",
                table: "UserWorkspaces",
                column: "ActiveNoteId");

            migrationBuilder.CreateIndex(
                name: "IX_UserWorkspaces_UpdatedAt",
                table: "UserWorkspaces",
                column: "UpdatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_UserWorkspaces_UserId",
                table: "UserWorkspaces",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmbeddingCache");

            migrationBuilder.DropTable(
                name: "NotificationDevices");

            migrationBuilder.DropTable(
                name: "NotificationHistory");

            migrationBuilder.DropTable(
                name: "StoredFiles");

            migrationBuilder.DropTable(
                name: "UserAchievements");

            migrationBuilder.DropTable(
                name: "UserNoteAccess");

            migrationBuilder.DropTable(
                name: "UserRoleAssignments");

            migrationBuilder.DropTable(
                name: "UserWorkspaces");

            migrationBuilder.DropTable(
                name: "Achievements");

            migrationBuilder.DropIndex(
                name: "IX_Notes_UserId_Sha256Hash",
                table: "Notes");

            migrationBuilder.DropIndex(
                name: "IX_NoteChunks_NoteId_Sha256",
                table: "NoteChunks");

            migrationBuilder.DropColumn(
                name: "ExperiencePoints",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "LastStreakDate",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "Level",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "LoginStreak",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalLogins",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalNotes",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalSearches",
                table: "UserProfiles");

            migrationBuilder.DropColumn(
                name: "TotalTimeSpentMinutes",
                table: "UserProfiles");

            migrationBuilder.AlterColumn<string>(
                name: "EntityId",
                table: "TextSpans",
                type: "TEXT",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Notes_Sha256Hash",
                table: "Notes",
                column: "Sha256Hash",
                unique: true);
        }
    }
}
