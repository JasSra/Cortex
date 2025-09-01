using System.Security.Claims;

namespace CortexApi.Middleware;

public class DevAuthBypassMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<DevAuthBypassMiddleware> _logger;

    public DevAuthBypassMiddleware(RequestDelegate next, IWebHostEnvironment environment, ILogger<DevAuthBypassMiddleware> logger)
    {
        _next = next;
        _environment = environment;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Only bypass in development environment
        if (_environment.IsDevelopment() && !context.User.Identity!.IsAuthenticated)
        {
            // Check if this is an API endpoint that needs auth
            var path = context.Request.Path.Value?.ToLowerInvariant();
            if (path != null && path.StartsWith("/api/") && !path.StartsWith("/api/health"))
            {
                _logger.LogDebug("Development mode: bypassing authentication for {Path}", path);
                
                // Create a fake user identity for development
                var claims = new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, "dev-user"),
                    new Claim(ClaimTypes.Name, "Development User"),
                    new Claim(ClaimTypes.Email, "dev@localhost"),
                    new Claim("sub", "dev-user"),
                    new Claim("name", "Development User"),
                    new Claim("email", "dev@localhost")
                };

                var identity = new ClaimsIdentity(claims, "Development");
                context.User = new ClaimsPrincipal(identity);
            }
        }

        await _next(context);
    }
}
