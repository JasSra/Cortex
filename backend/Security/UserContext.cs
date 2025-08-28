using System.Security.Claims;

namespace CortexApi.Security;

public interface IUserContextAccessor
{
    string UserId { get; }
    IReadOnlyCollection<string> Roles { get; }
    bool IsInRole(string role);
}

public class UserContextAccessor : IUserContextAccessor
{
    private readonly List<string> _roles = new();
    public string UserId { get; private set; } = "default";
    public IReadOnlyCollection<string> Roles => _roles;

    public void Set(string userId, IEnumerable<string> roles)
    {
        UserId = string.IsNullOrWhiteSpace(userId) ? "default" : userId;
        _roles.Clear();
        _roles.AddRange(roles.Select(r => r.Trim()).Where(r => !string.IsNullOrWhiteSpace(r)).Distinct(StringComparer.OrdinalIgnoreCase));
    }

    public bool IsInRole(string role) => _roles.Contains(role, StringComparer.OrdinalIgnoreCase);
}

public class UserContextMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IWebHostEnvironment _env;

    public UserContextMiddleware(RequestDelegate next, IWebHostEnvironment env)
    {
        _next = next; _env = env;
    }

    public async Task InvokeAsync(HttpContext context, UserContextAccessor accessor)
    {
        // Extract from headers (or claims in future OIDC phase)
        var hdrUser = context.Request.Headers["X-UserId"].FirstOrDefault();
        var hdrRolesRaw = context.Request.Headers["X-Roles"].FirstOrDefault();
        var roles = (hdrRolesRaw ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();

        // Dev-friendly default: Admin if no roles in Development, Reader otherwise
        if (roles.Count == 0)
        {
            roles = _env.IsDevelopment() ? new List<string> { "Admin", "Editor", "Reader" } : new List<string> { "Reader" };
        }

        accessor.Set(hdrUser ?? "default", roles);

        await _next(context);
    }
}

public static class Rbac
{
    public static bool RequireRole(IUserContextAccessor user, string role) => user.IsInRole(role);
}
