using System.Security.Claims;

namespace CortexApi.Security;

public interface IUserContextAccessor
{
    string UserId { get; }
    string? UserSubjectId { get; }
    string? UserEmail { get; }
    string? UserName { get; }
    IReadOnlyCollection<string> Roles { get; }
    bool IsInRole(string role);
    bool IsAuthenticated { get; }
}

public class UserContextAccessor : IUserContextAccessor
{
    private readonly List<string> _roles = new();
    public string UserId { get; private set; } = "default";
    public string? UserSubjectId { get; private set; }
    public string? UserEmail { get; private set; }
    public string? UserName { get; private set; }
    public bool IsAuthenticated { get; private set; }
    public IReadOnlyCollection<string> Roles => _roles;

    public void Set(string userId, string? subjectId, string? email, string? name, IEnumerable<string> roles, bool isAuthenticated)
    {
        UserId = string.IsNullOrWhiteSpace(userId) ? "default" : userId;
        UserSubjectId = subjectId;
        UserEmail = email;
        UserName = name;
        IsAuthenticated = isAuthenticated;
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
        var isAuthenticated = context.User.Identity?.IsAuthenticated ?? false;
        string userId = "default";
        string? subjectId = null;
        string? email = null;
        string? name = null;
        var roles = new List<string>();

        if (isAuthenticated)
        {
            // Extract from JWT claims
            subjectId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                       ?? context.User.FindFirst("sub")?.Value;
            
            email = context.User.FindFirst(ClaimTypes.Email)?.Value 
                   ?? context.User.FindFirst("preferred_username")?.Value;
            
            name = context.User.FindFirst(ClaimTypes.Name)?.Value 
                  ?? context.User.FindFirst("name")?.Value;

            // Use subject ID as primary user identifier for data binding
            userId = subjectId ?? email ?? "default";

            // Extract roles from claims (support Azure AD B2C extension, standard roles and custom claim 'roles')
            var roleClaims = context.User.FindAll(ClaimTypes.Role)
                               .Concat(context.User.FindAll("roles"))
                               .Concat(context.User.FindAll("extension_Role"))
                               .Select(c => c.Value)
                               .ToList();

            roles.AddRange(roleClaims);

            // Map API scopes (scp) to app roles if roles are not present
            var scopeRaw = context.User.FindFirst("scp")?.Value 
                        ?? context.User.FindFirst("http://schemas.microsoft.com/identity/claims/scope")?.Value;
            if (!string.IsNullOrWhiteSpace(scopeRaw))
            {
                var scopes = scopeRaw.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (scopes.Contains("Consolidated.Administrator", StringComparer.OrdinalIgnoreCase))
                {
                    roles.AddRange(new[] { "Admin", "Editor", "Reader" });
                }
                if (scopes.Contains("Consolidated.Client", StringComparer.OrdinalIgnoreCase))
                {
                    roles.AddRange(new[] { "Editor", "Reader" });
                }
                if (scopes.Contains("Consolidated.User", StringComparer.OrdinalIgnoreCase))
                {
                    roles.Add("Reader");
                }
            }
        }
        else
        {
            // Fallback to headers for development/testing
            var hdrUser = context.Request.Headers["X-UserId"].FirstOrDefault();
            var hdrRolesRaw = context.Request.Headers["X-Roles"].FirstOrDefault();
            
            if (!string.IsNullOrEmpty(hdrUser))
            {
                userId = hdrUser;
                isAuthenticated = true;
            }

            if (!string.IsNullOrEmpty(hdrRolesRaw))
            {
                roles.AddRange(hdrRolesRaw
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
            }
        }

        // Do not inject default roles in production. In Development, keep dev-friendly defaults.
        if (roles.Count == 0 && _env.IsDevelopment())
        {
            roles = new List<string> { "Admin", "Editor", "Reader" };
        }

        accessor.Set(userId, subjectId, email, name, roles, isAuthenticated);
        await _next(context);
    }
}

public static class Rbac
{
    public static bool RequireRole(IUserContextAccessor user, string role) => user.IsInRole(role);
}
