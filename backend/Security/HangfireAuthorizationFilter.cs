using Hangfire.Dashboard;

namespace CortexApi.Security;

public class HangfireAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        // In development, allow access
        var httpContext = context.GetHttpContext();
        var environment = httpContext.RequestServices.GetRequiredService<IWebHostEnvironment>();
        
        if (environment.IsDevelopment())
        {
            return true;
        }
        
        // In production, require authentication
        return httpContext.User?.Identity?.IsAuthenticated ?? false;
    }
}
