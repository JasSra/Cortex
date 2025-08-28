using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CortexApi.Migrations
{
    /// <inheritdoc />
    public partial class Stage3_EntityGraph_NER_v2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CanonicalEntityId",
                table: "Entities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CanonicalValue",
                table: "Entities",
                type: "TEXT",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "ConfidenceScore",
                table: "Entities",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeenAt",
                table: "Entities",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "MentionCount",
                table: "Entities",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "Edges",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", nullable: false),
                    FromEntityId = table.Column<string>(type: "TEXT", nullable: false),
                    ToEntityId = table.Column<string>(type: "TEXT", nullable: false),
                    RelationType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Confidence = table.Column<double>(type: "REAL", nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Edges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Edges_Entities_FromEntityId",
                        column: x => x.FromEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Edges_Entities_ToEntityId",
                        column: x => x.ToEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Entities_CanonicalEntityId",
                table: "Entities",
                column: "CanonicalEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_Entities_Type_CanonicalValue",
                table: "Entities",
                columns: new[] { "Type", "CanonicalValue" });

            migrationBuilder.CreateIndex(
                name: "IX_Edges_FromEntityId_ToEntityId_RelationType",
                table: "Edges",
                columns: new[] { "FromEntityId", "ToEntityId", "RelationType" });

            migrationBuilder.CreateIndex(
                name: "IX_Edges_RelationType",
                table: "Edges",
                column: "RelationType");

            migrationBuilder.CreateIndex(
                name: "IX_Edges_ToEntityId",
                table: "Edges",
                column: "ToEntityId");

            migrationBuilder.AddForeignKey(
                name: "FK_Entities_Entities_CanonicalEntityId",
                table: "Entities",
                column: "CanonicalEntityId",
                principalTable: "Entities",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Entities_Entities_CanonicalEntityId",
                table: "Entities");

            migrationBuilder.DropTable(
                name: "Edges");

            migrationBuilder.DropIndex(
                name: "IX_Entities_CanonicalEntityId",
                table: "Entities");

            migrationBuilder.DropIndex(
                name: "IX_Entities_Type_CanonicalValue",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "CanonicalEntityId",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "CanonicalValue",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "ConfidenceScore",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "LastSeenAt",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "MentionCount",
                table: "Entities");
        }
    }
}
