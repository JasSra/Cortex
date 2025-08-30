using Microsoft.AspNetCore.Mvc;
using CortexApi.Services;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Seed sample data for a new user
/// </summary>
[ApiController]
[Route("api/seed-data")]
public class SeedController : ControllerBase
{
    private readonly ISeedDataService _seedDataService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<SeedController> _logger;
    private readonly IWebHostEnvironment _env;
    private readonly CortexApi.Data.CortexDbContext _db;

    public SeedController(
        ISeedDataService seedDataService,
        IUserContextAccessor userContext,
        ILogger<SeedController> logger,
        IWebHostEnvironment env,
        CortexApi.Data.CortexDbContext db)
    {
        _seedDataService = seedDataService;
        _userContext = userContext;
        _logger = logger;
        _env = env;
        _db = db;
    }

    /// <summary>
    /// Create seed notes for the current user if they have none
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Seed()
    {
    // Allow unauthenticated seeding in Development for convenience
    var isDevelopment = _env.IsDevelopment();

        // Require at least Reader role in non-dev environments
        if (!isDevelopment && !Rbac.RequireRole(_userContext, "Reader"))
            return StatusCode(403, "Reader role required");

        try
        {
            var userId = _userContext.UserId ?? "dev-user";
            var hadData = await _seedDataService.HasUserDataAsync(userId);
            await _seedDataService.SeedDataForNewUserAsync(userId);
            var total = await _db.Notes.CountAsync(n => n.UserId == userId);
            return Ok(new { message = "Seed data created (if needed)", userId, hadData, total });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to seed data for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to seed data" });
        }
    }
}
