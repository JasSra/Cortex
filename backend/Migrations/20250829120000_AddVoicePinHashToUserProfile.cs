using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CortexApi.Migrations
{
    /// <inheritdoc />
    public partial class AddVoicePinHashToUserProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "VoicePinHash",
                table: "UserProfiles",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "VoicePinHash",
                table: "UserProfiles");
        }
    }
}
