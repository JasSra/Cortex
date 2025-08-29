using Microsoft.AspNetCore.Mvc;
using CortexApi.Services;
using CortexApi.Security;

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

    public SeedController(
        ISeedDataService seedDataService,
        IUserContextAccessor userContext,
        ILogger<SeedController> logger)
    {
        _seedDataService = seedDataService;
        _userContext = userContext;
        _logger = logger;
    }

    /// <summary>
    /// Create seed notes for the current user if they have none
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Seed()
    {
        // Require at least Reader role to trigger seeding for self
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return StatusCode(403, "Reader role required");

        try
        {
            var userId = _userContext.UserId;
            await _seedDataService.SeedDataForNewUserAsync(userId);
            return Ok(new { message = "Seed data created (if needed)" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to seed data for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to seed data" });
        }
    }
}
