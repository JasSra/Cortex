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

var builder = WebApplication.CreateBuilder(args);

// Build an absolute SQLite connection string so DB path is consistent regardless of CWD
var originalCs = builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=.\\data\\cortex.db";
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
builder.Services.AddSingleton<IVectorService, VectorService>();
builder.Services.AddScoped<IEmbeddingService, EmbeddingService>();
// Background job service temporarily disabled for testing
// builder.Services.AddSingleton<BackgroundJobService>();
// builder.Services.AddHostedService<BackgroundJobService>(provider => provider.GetRequiredService<BackgroundJobService>());
// builder.Services.AddScoped<IBackgroundJobService>(provider => provider.GetRequiredService<BackgroundJobService>());
builder.Services.AddScoped<IBackgroundJobService, BackgroundJobService>();
builder.Services.AddScoped<IRagService, RagService>();
// Detection services for auto-classification
builder.Services.AddScoped<IPiiDetectionService, PiiDetectionService>();
builder.Services.AddScoped<ISecretsDetectionService, SecretsDetectionService>();
builder.Services.AddScoped<IClassificationService, ClassificationService>();
// Redaction service for Stage 2C
builder.Services.AddScoped<IRedactionService, RedactionService>();
// Stage 3 services
builder.Services.AddScoped<INerService, NerService>();
builder.Services.AddScoped<IGraphService, GraphService>();
builder.Services.AddScoped<IChatToolsService, ChatToolsService>();
builder.Services.AddScoped<ISuggestionsService, SuggestionsService>();
builder.Services.AddScoped<IAuditService, AuditService>();
// User context / RBAC
builder.Services.AddScoped<UserContextAccessor>();
builder.Services.AddScoped<IUserContextAccessor>(sp => sp.GetRequiredService<UserContextAccessor>());

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
app.UseWebSockets();
// Inject per-request user context before endpoints
app.UseMiddleware<UserContextMiddleware>();

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    // Ensure data directory exists for SQLite (based on absolute DataSource path)
    try
    {
        var dbDir = Path.GetDirectoryName(csb.DataSource);
        if (!string.IsNullOrEmpty(dbDir) && !Directory.Exists(dbDir)) Directory.CreateDirectory(dbDir);
    }
    catch { /* ignore */ }

    var context = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    // In Development, force-recreate to keep schema in sync with model (no migrations used yet)
    if (app.Environment.IsDevelopment())
    {
        try { context.Database.EnsureDeleted(); } catch { }
    }
    context.Database.EnsureCreated();

    // Dev safety: if new tables were added after DB existed (EnsureCreated won't add), reset DB file
    try
    {
        var conn = context.Database.GetDbConnection();
        await conn.OpenAsync();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name IN ('Embeddings','Tags','NoteTags','Classifications','ActionLogs')";
        var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        // Debug: list tables present
        try
        {
            using var listCmd = conn.CreateCommand();
            listCmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
            using var r = await listCmd.ExecuteReaderAsync();
            var tbls = new List<string>();
            while (await r.ReadAsync()) tbls.Add(r.GetString(0));
            Console.WriteLine($"[DB] Tables: {string.Join(", ", tbls)}");
        }
        catch { }
        await conn.CloseAsync();
        if (count < 5)
        {
            var fullPath = csb.DataSource;
            try { if (!string.IsNullOrWhiteSpace(fullPath) && File.Exists(fullPath)) File.Delete(fullPath); } catch { }
            context.Database.EnsureCreated();
            // Log again after recreate
            try
            {
                var conn2 = context.Database.GetDbConnection();
                await conn2.OpenAsync();
                using var listCmd2 = conn2.CreateCommand();
                listCmd2.CommandText = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
                using var r2 = await listCmd2.ExecuteReaderAsync();
                var tbls2 = new List<string>();
                while (await r2.ReadAsync()) tbls2.Add(r2.GetString(0));
                Console.WriteLine($"[DB] After recreate tables: {string.Join(", ", tbls2)}");
                await conn2.CloseAsync();
            }
            catch { }
        }
    }
    catch { /* ignore */ }

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
