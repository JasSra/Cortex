using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using CortexApi.Data;
using CortexApi.Services;
using CortexApi.Models;
using System.Net.WebSockets;
using System.Data;
using Microsoft.Data.Sqlite;
using CortexApi.Security;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// Build an absolute SQLite connection string so DB path is consistent regardless of CWD
var originalCs = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=./data/cortex.db";
var csb = new SqliteConnectionStringBuilder(originalCs);
if (!Path.IsPathRooted(csb.DataSource))
{
    csb.DataSource = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, csb.DataSource));
}
var absoluteSqliteConnectionString = csb.ToString();

// Add services to the container
builder.Services.AddDbContext<CortexDbContext>(options =>
    options
        .UseSqlite(absoluteSqliteConnectionString)
        .EnableSensitiveDataLogging(false)
        .EnableDetailedErrors(false));
// Reduce EF Core info-level command logging noise
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);

builder.Services.AddHttpClient();
builder.Services.AddScoped<IIngestService, IngestService>();
builder.Services.AddScoped<ISearchService, SearchService>();
builder.Services.AddScoped<IVoiceService, VoiceService>();
builder.Services.AddScoped<IChatService, ChatService>();
builder.Services.AddScoped<IChatToolsService, ChatToolsService>();
builder.Services.AddScoped<ISuggestionsService, SuggestionsService>();
builder.Services.AddSingleton<IVectorService, VectorService>();
builder.Services.AddScoped<IEmbeddingService, EmbeddingService>();
builder.Services.AddScoped<INerService, NerService>();
builder.Services.AddScoped<IGraphService, GraphService>();
// Background job service temporarily disabled for testing
builder.Services.AddSingleton<BackgroundJobService>();
builder.Services.AddHostedService<BackgroundJobService>(provider => provider.GetRequiredService<BackgroundJobService>());
builder.Services.AddScoped<IBackgroundJobService>(provider => provider.GetRequiredService<BackgroundJobService>());
builder.Services.AddScoped<IRagService, RagService>();
// Detection services for auto-classification
builder.Services.AddScoped<IPiiDetectionService, PiiDetectionService>();
builder.Services.AddScoped<ISecretsDetectionService, SecretsDetectionService>();
builder.Services.AddScoped<IClassificationService, ClassificationService>();
builder.Services.AddScoped<IRedactionService, RedactionService>();
// Seed data service for new users
builder.Services.AddScoped<ISeedDataService, SeedDataService>();
// Gamification service for achievements and stats
builder.Services.AddScoped<IGamificationService, GamificationService>();
// Audit service for security/audit endpoints
builder.Services.AddScoped<IAuditService, AuditService>();
// Notification service for push notifications and email
builder.Services.AddScoped<INotificationService, NotificationService>();
// User context / RBAC
builder.Services.AddScoped<UserContextAccessor>();
builder.Services.AddScoped<IUserContextAccessor>(sp => sp.GetRequiredService<UserContextAccessor>());

// Add Authentication with JWT Bearer (MSAL.js integration)
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Azure B2C configuration
        options.Authority = builder.Configuration["Authentication:Authority"] ?? "https://cortexb2c.b2clogin.com/cortexb2c.onmicrosoft.com/B2C_1_cortex_signup_signin/v2.0";
        options.Audience = builder.Configuration["Authentication:ClientId"] ?? "34fb7a0c-4038-4ceb-96c6-e56fdd2dd57e";
        
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(5),
            // B2C specific settings
            NameClaimType = "name",
            RoleClaimType = "extension_Role"
        };

        // Support tokens in query for WebSocket/media elements and SSE (stt, tts/stream, jobs status)
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"].ToString();
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) &&
                    (path.StartsWithSegments("/voice/stt") ||
                     path.StartsWithSegments("/api/Voice/tts/stream") ||
                     path.StartsWithSegments("/api/Jobs/status/stream")))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            },
            // Keep dev-friendly challenge but do not convert to 200 for protected endpoints
            OnChallenge = context =>
            {
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// Add CORS (configurable via CORS_ORIGINS or Server:CorsOrigins)
var corsOrigins = builder.Configuration["CORS_ORIGINS"]?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                 ?? builder.Configuration.GetSection("Server:CorsOrigins").Get<string[]>()
                 ?? new[] { "http://localhost:3000", "http://localhost:3001" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(corsOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Add Controllers
builder.Services.AddControllers();

// Add Swagger/OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo 
    { 
        Title = "Cortex API", 
        Version = "v1",
        Description = "Voice-first notes brain API"
    });
    
    // Add JWT authentication
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            new string[] {}
        }
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Ensure we also listen on :8080 unless ASPNETCORE_URLS explicitly set
var urlsEnv = builder.Configuration["ASPNETCORE_URLS"];
if (string.IsNullOrWhiteSpace(urlsEnv))
{
    var port = builder.Configuration["PORT"]
               ?? builder.Configuration["Server:Port"]
               ?? "8080";
    try
    {
        app.Urls.Add($"http://localhost:{port}");
    }
    catch { /* ignore if already bound */ }
}

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.UseWebSockets();
// Inject per-request user context before endpoints
app.UseMiddleware<UserContextMiddleware>();

// Serve uploaded files from configurable storage root under /storage
var storageRoot = builder.Configuration["Storage:Root"] ?? Path.Combine(app.Environment.ContentRootPath, "storage");
if (!Directory.Exists(storageRoot)) Directory.CreateDirectory(storageRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(storageRoot),
    RequestPath = "/storage",
    ServeUnknownFileTypes = true,
    ContentTypeProvider = new FileExtensionContentTypeProvider()
});

// Ensure database is up-to-date (use EF Core migrations)
using (var scope = app.Services.CreateScope())
{
    // Ensure data directory exists for SQLite (based on absolute DataSource path)
    try
    {
        var dbDir = Path.GetDirectoryName(csb.DataSource);
        if (!string.IsNullOrEmpty(dbDir) && !Directory.Exists(dbDir)) 
        {
            Directory.CreateDirectory(dbDir);
            Console.WriteLine($"[DB] Created database directory: {dbDir}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] Failed to create database directory: {ex.Message}");
    }

    var context = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    try
    {
        if (app.Environment.IsDevelopment())
        {
            Console.WriteLine("[DB] Development mode: resetting database to current model...");
            try
            {
                if (File.Exists(csb.DataSource))
                {
                    File.Delete(csb.DataSource);
                    Console.WriteLine($"[DB] Deleted SQLite file: {csb.DataSource}");
                }
            }
            catch (Exception delEx)
            {
                Console.WriteLine($"[DB] Could not delete DB file: {delEx.Message}");
            }

            // Recreate schema directly from the current model (no migrations needed in dev)
            context.Database.EnsureDeleted();
            context.Database.EnsureCreated();
            Console.WriteLine("[DB] Database recreated from current model");
        }
        else
        {
            Console.WriteLine("[DB] Applying migrations...");
            context.Database.Migrate();
            Console.WriteLine("[DB] Migrations applied successfully");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] Initialization failed: {ex.Message}");
    }

    // Ensure vector index exists
    try
    {
        var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
        var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();
        await vector.EnsureIndexAsync(embed.GetEmbeddingDim());
    }
    catch { /* optional backend; ignore */ }
}

// Use Controllers (most endpoints moved to separate controller files)
app.MapControllers();

// WebSocket endpoint for STT (requires special handling)
app.Map("/voice/stt", async (HttpContext context, IVoiceService voiceService) =>
{
    // Enforce authentication for WebSocket STT
    if (!(context.User?.Identity?.IsAuthenticated ?? false))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;
    }
    if (context.WebSockets.IsWebSocketRequest)
    {
        var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        await voiceService.HandleSttWebSocketAsync(webSocket);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
    }
});

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
.WithName("HealthCheck");

app.Run();

// Request models
public record FolderIngestRequest(string Path);
