using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using CortexApi.Data;
using CortexApi.Services;
using CortexApi.Services.Providers;
using CortexApi.Models;
using System.Net.WebSockets;
using System.Data;
using Microsoft.Data.Sqlite;
using CortexApi.Security;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.ML;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

// Enable legacy code page encodings for libraries like iTextSharp (e.g., MacRoman CP10000)
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

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

// Register LLM Providers
builder.Services.AddHttpClient<OpenAiLlmProvider>();
builder.Services.AddHttpClient<OllamaLlmProvider>();
builder.Services.AddScoped<OpenAiLlmProvider>();
builder.Services.AddScoped<OllamaLlmProvider>();
builder.Services.AddScoped<ILlmProviderFactory, LlmProviderFactory>();

// Register Embedding Providers
builder.Services.AddHttpClient<OpenAiEmbeddingProvider>();
builder.Services.AddHttpClient<LocalEmbeddingProvider>();
builder.Services.AddScoped<OpenAiEmbeddingProvider>();
builder.Services.AddScoped<LocalEmbeddingProvider>();
builder.Services.AddScoped<IEmbeddingProviderFactory, EmbeddingProviderFactory>();

// Register active providers based on configuration
builder.Services.AddScoped<ILlmProvider>(provider =>
{
    var config = provider.GetRequiredService<IConfigurationService>();
    var factory = provider.GetRequiredService<ILlmProviderFactory>();
    var llmProvider = config.GetConfiguration()["LLM:Provider"] ?? "openai";
    return factory.CreateProvider(llmProvider);
});

builder.Services.AddScoped<IEmbeddingProvider>(provider =>
{
    var config = provider.GetRequiredService<IConfigurationService>();
    var factory = provider.GetRequiredService<IEmbeddingProviderFactory>();
    var embeddingProvider = config.GetConfiguration()["Embedding:Provider"] ?? "openai";
    return factory.CreateProvider(embeddingProvider);
});

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

// Configure host options to prevent background service failures from stopping the host
builder.Services.Configure<HostOptions>(hostOptions =>
{
    hostOptions.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore;
});
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
// Configuration service for dynamic app configuration
builder.Services.AddScoped<IConfigurationService, ConfigurationService>();
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
var corsOriginsSetting = builder.Configuration["CORS_ORIGINS"];
string[] corsOrigins;
if (!string.IsNullOrWhiteSpace(corsOriginsSetting))
{
    corsOrigins = corsOriginsSetting.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
else
{
    corsOrigins = builder.Configuration.GetSection("Server:CorsOrigins").Get<string[]>()
                   ?? new[] { "http://localhost:3000", "http://localhost:3001" };
}

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

// CLI: model training mode (train models from CSV/JSONL then exit)
if (args.Contains("--train-models", StringComparer.OrdinalIgnoreCase))
{
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    try
    {
        var cls = services.GetRequiredService<IClassificationService>();

        static string? GetArg(string[] a, string key)
        {
            for (int i = 0; i < a.Length; i++)
            {
                if (string.Equals(a[i], key, StringComparison.OrdinalIgnoreCase))
                    return i + 1 < a.Length ? a[i + 1] : null;
                if (a[i].StartsWith(key + "=", StringComparison.OrdinalIgnoreCase))
                    return a[i].Substring(key.Length + 1);
            }
            return null;
        }

        var topicPath = GetArg(args, "--topic") ?? GetArg(args, "--topics");
        var sensPath = GetArg(args, "--sensitivity") ?? GetArg(args, "--sensitivity-file");

        if (string.IsNullOrWhiteSpace(topicPath) && string.IsNullOrWhiteSpace(sensPath))
        {
            Console.WriteLine("[Train] Provide --topic <file> and/or --sensitivity <file> (CSV or JSONL)");
            return;
        }

        static IEnumerable<string> ReadLines(string path)
        {
            using var fs = File.OpenRead(path);
            using var sr = new StreamReader(fs);
            string? line;
            while ((line = sr.ReadLine()) is not null)
                if (!string.IsNullOrWhiteSpace(line)) yield return line;
        }

        static bool LooksLikeJson(string line) => line.TrimStart().StartsWith("{");

        var topicData = new List<CortexApi.Services.TrainingData>();
        if (!string.IsNullOrWhiteSpace(topicPath) && File.Exists(topicPath))
        {
            Console.WriteLine($"[Train] Loading topics from {topicPath}");
            foreach (var line in ReadLines(topicPath))
            {
                try
                {
                    if (LooksLikeJson(line))
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(line);
                        var root = doc.RootElement;
                        var text = root.TryGetProperty("Text", out var t1) ? t1.GetString() : (root.TryGetProperty("text", out var t2) ? t2.GetString() : null);
                        var topic = root.TryGetProperty("Topic", out var p1) ? p1.GetString() : (root.TryGetProperty("topic", out var p2) ? p2.GetString() : null);
                        if (!string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(topic))
                            topicData.Add(new CortexApi.Services.TrainingData { Text = text!, Topic = topic! });
                    }
                    else
                    {
                        var cells = System.Text.RegularExpressions.Regex.Matches(line, "\"([^\"]*)\"|([^,]+)")
                            .Select(m => m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value)
                            .ToList();
                        if (cells.Count >= 2)
                        {
                            var text = cells[0].Trim();
                            var topic = cells[1].Trim();
                            if (!string.IsNullOrWhiteSpace(text) && !string.IsNullOrWhiteSpace(topic))
                                topicData.Add(new CortexApi.Services.TrainingData { Text = text, Topic = topic });
                        }
                    }
                }
                catch { }
            }
        }

        var sensData = new List<CortexApi.Services.SensitivityTrainingData>();
        if (!string.IsNullOrWhiteSpace(sensPath) && File.Exists(sensPath))
        {
            Console.WriteLine($"[Train] Loading sensitivity from {sensPath}");
            foreach (var line in ReadLines(sensPath))
            {
                try
                {
                    if (LooksLikeJson(line))
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(line);
                        var root = doc.RootElement;
                        var text = root.TryGetProperty("Text", out var t1) ? t1.GetString() : (root.TryGetProperty("text", out var t2) ? t2.GetString() : null);
                        double score = -1;
                        if (root.TryGetProperty("SensitivityScore", out var s1) && s1.ValueKind == System.Text.Json.JsonValueKind.Number) score = s1.GetDouble();
                        else if (root.TryGetProperty("sensitivityScore", out var s2) && s2.ValueKind == System.Text.Json.JsonValueKind.Number) score = s2.GetDouble();
                        if (!string.IsNullOrWhiteSpace(text) && score >= 0 && score <= 1)
                            sensData.Add(new CortexApi.Services.SensitivityTrainingData { Text = text!, SensitivityScore = score });
                    }
                    else
                    {
                        var cells = System.Text.RegularExpressions.Regex.Matches(line, "\"([^\"]*)\"|([^,]+)")
                            .Select(m => m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value)
                            .ToList();
                        if (cells.Count >= 2 && double.TryParse(cells[1].Trim(), out var score) && score >= 0 && score <= 1)
                        {
                            var text = cells[0].Trim();
                            if (!string.IsNullOrWhiteSpace(text))
                                sensData.Add(new CortexApi.Services.SensitivityTrainingData { Text = text, SensitivityScore = score });
                        }
                    }
                }
                catch { }
            }
        }

        if (topicData.Count > 0)
        {
            Console.WriteLine($"[Train] Training topic model with {topicData.Count} samples…");
            await cls.TrainTopicModelAsync(topicData);
            try
            {
                // Also save a copy under content-root Models for portability
                var ml = new MLContext(seed: 0);
                var dv = ml.Data.LoadFromEnumerable(topicData.Select(d => new CortexApi.Services.TopicInput { Text = d.Text, Label = d.Topic }));
                var pipe = ml.Transforms.Conversion.MapValueToKey("Label")
                    .Append(ml.Transforms.Text.FeaturizeText("Features", "Text"))
                    .Append(ml.MulticlassClassification.Trainers.SdcaMaximumEntropy("Label", "Features"))
                    .Append(ml.Transforms.Conversion.MapKeyToValue("PredictedLabel"));
                var model = pipe.Fit(dv);
                var modelsDir = Path.Combine(app.Environment.ContentRootPath, "Models");
                Directory.CreateDirectory(modelsDir);
                ml.Model.Save(model, dv.Schema, Path.Combine(modelsDir, "topic_model.zip"));
                Console.WriteLine($"[Train] Topic model also saved to {modelsDir}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Train] Topic model secondary save failed: {ex.Message}");
            }
        }
        if (sensData.Count > 0)
        {
            Console.WriteLine($"[Train] Training sensitivity model with {sensData.Count} samples…");
            await cls.TrainSensitivityModelAsync(sensData);
            try
            {
                var ml = new MLContext(seed: 0);
                var dv = ml.Data.LoadFromEnumerable(sensData.Select(d => new CortexApi.Services.SensitivityInput { Text = d.Text, Label = (float)d.SensitivityScore }));
                var pipe = ml.Transforms.Text.FeaturizeText("Features", "Text")
                    .Append(ml.Regression.Trainers.Sdca(labelColumnName: "Label", featureColumnName: "Features"));
                var model = pipe.Fit(dv);
                var modelsDir = Path.Combine(app.Environment.ContentRootPath, "Models");
                Directory.CreateDirectory(modelsDir);
                ml.Model.Save(model, dv.Schema, Path.Combine(modelsDir, "sensitivity_model.zip"));
                Console.WriteLine($"[Train] Sensitivity model also saved to {modelsDir}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Train] Sensitivity model secondary save failed: {ex.Message}");
            }
        }
        Console.WriteLine("[Train] Done. Models saved under backend/bin/<Config>/net8.0/Models");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[Train] Failed: {ex.Message}");
        Environment.ExitCode = 1;
    }
    return;
}

// CLI: export training data (from DB to CSV/JSONL) then exit
if (args.Contains("--export-training", StringComparer.OrdinalIgnoreCase))
{
    using var scope = app.Services.CreateScope();
    var sp = scope.ServiceProvider;
    try
    {
        var db = sp.GetRequiredService<CortexDbContext>();

        static string? GetArg(string[] a, string key)
        {
            for (int i = 0; i < a.Length; i++)
            {
                if (string.Equals(a[i], key, StringComparison.OrdinalIgnoreCase))
                    return i + 1 < a.Length ? a[i + 1] : null;
                if (a[i].StartsWith(key + "=", StringComparison.OrdinalIgnoreCase))
                    return a[i].Substring(key.Length + 1);
            }
            return null;
        }

        var outDir = GetArg(args, "--out") ?? Path.Combine(app.Environment.ContentRootPath, "data", "training");
        var format = (GetArg(args, "--format") ?? "jsonl").ToLowerInvariant(); // jsonl|csv
        var minWordsStr = GetArg(args, "--min-words");
        var maxCountStr = GetArg(args, "--max-count");
        int minWords = int.TryParse(minWordsStr, out var mw) ? Math.Max(0, mw) : 20;
        int maxCount = int.TryParse(maxCountStr, out var mc) ? Math.Max(0, mc) : 5000;

        Directory.CreateDirectory(outDir);

        // Load data
        var notes = await db.Notes.AsNoTracking().Where(n => !n.IsDeleted && !string.IsNullOrEmpty(n.Content)).ToListAsync();
        var feedbacks = await db.UserFeedbacks.AsNoTracking().ToListAsync();

        // Build topic samples: feedback first, then fallback to first tag
        var topics = new List<(string text, string topic)>();
        var byNote = notes.ToDictionary(n => n.Id);
        foreach (var fb in feedbacks)
        {
            if (string.IsNullOrWhiteSpace(fb.NoteId)) continue;
            if (!byNote.TryGetValue(fb.NoteId, out var note)) continue;
            var text = note.Content ?? string.Empty;
            if (string.IsNullOrWhiteSpace(text)) continue;
            var wc = text.Split((char[])null!, StringSplitOptions.RemoveEmptyEntries).Length;
            if (wc < minWords) continue;
            if (!string.IsNullOrWhiteSpace(fb.ActualTopic))
            {
                topics.Add((text, fb.ActualTopic.Trim()))
;            }
        }
        if (topics.Count < maxCount)
        {
            foreach (var n in notes)
            {
                if (string.IsNullOrWhiteSpace(n.Tags)) continue;
                var text = n.Content ?? string.Empty;
                if (string.IsNullOrWhiteSpace(text)) continue;
                var wc = text.Split((char[])null!, StringSplitOptions.RemoveEmptyEntries).Length;
                if (wc < minWords) continue;
                var firstTag = n.Tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
                if (string.IsNullOrWhiteSpace(firstTag)) continue;
                topics.Add((text, firstTag));
                if (topics.Count >= maxCount) break;
            }
        }

        // Build sensitivity samples: feedback score or heuristic from sensitivity level and flags
        var sens = new List<(string text, double score)>();
        foreach (var fb in feedbacks)
        {
            if (string.IsNullOrWhiteSpace(fb.NoteId)) continue;
            if (!byNote.TryGetValue(fb.NoteId, out var note)) continue;
            var text = note.Content ?? string.Empty;
            if (string.IsNullOrWhiteSpace(text)) continue;
            var wc = text.Split((char[])null!, StringSplitOptions.RemoveEmptyEntries).Length;
            if (wc < minWords) continue;
            if (fb.ActualSensitivity >= 0)
                sens.Add((text, Math.Clamp(fb.ActualSensitivity, 0, 1)));
        }
        if (sens.Count < maxCount)
        {
            foreach (var n in notes)
            {
                var text = n.Content ?? string.Empty;
                if (string.IsNullOrWhiteSpace(text)) continue;
                var wc = text.Split((char[])null!, StringSplitOptions.RemoveEmptyEntries).Length;
                if (wc < minWords) continue;

                double baseScore = n.SensitivityLevel switch { >= 4 => 0.9, 3 => 0.75, 2 => 0.55, _ => 0.2 };
                if (!string.IsNullOrWhiteSpace(n.SecretFlags)) baseScore = Math.Max(baseScore, 0.9);
                else if (!string.IsNullOrWhiteSpace(n.PiiFlags)) baseScore = Math.Max(baseScore, 0.7);
                sens.Add((text, Math.Clamp(baseScore, 0, 1)));
                if (sens.Count >= maxCount) break;
            }
        }

        string topicsPath = Path.Combine(outDir, $"topics.{format}");
        string sensPath = Path.Combine(outDir, $"sensitivity.{format}");
        if (format == "jsonl")
        {
            await File.WriteAllLinesAsync(topicsPath, topics.Select(t => System.Text.Json.JsonSerializer.Serialize(new { text = t.text, topic = t.topic }))); 
            await File.WriteAllLinesAsync(sensPath, sens.Select(sv => System.Text.Json.JsonSerializer.Serialize(new { text = sv.text, sensitivityScore = sv.score })));
        }
        else // csv
        {
            static string CsvEscape(string s) => "\"" + s.Replace("\"", "\"\"") + "\"";
            await File.WriteAllLinesAsync(topicsPath, new[] { "text,topic" }.Concat(topics.Select(t => string.Join(',', CsvEscape(t.text), CsvEscape(t.topic)))));
            await File.WriteAllLinesAsync(sensPath, new[] { "text,score" }.Concat(sens.Select(sv => string.Join(',', CsvEscape(sv.text), sv.score.ToString(System.Globalization.CultureInfo.InvariantCulture)))));
        }

        Console.WriteLine($"[Export] Topics: {topics.Count} -> {topicsPath}");
        Console.WriteLine($"[Export] Sensitivity: {sens.Count} -> {sensPath}");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[Export] Failed: {ex.Message}");
        Environment.ExitCode = 1;
    }
    return;
}

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Ensure we also listen on :8081 unless ASPNETCORE_URLS explicitly set
var urlsEnv = builder.Configuration["ASPNETCORE_URLS"];
if (string.IsNullOrWhiteSpace(urlsEnv))
{
    var port = builder.Configuration["PORT"]
               ?? builder.Configuration["Server:Port"]
               ?? "8081";
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

// Removed public static file exposure under /storage; files are served via authenticated API endpoints in StorageController.

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
        // Baseline fix: if the database already has the initial schema but the migration history is empty,
        // mark the initial migration as applied so later migrations can proceed.
        try
        {
            using var conn = new SqliteConnection(absoluteSqliteConnectionString);
            await conn.OpenAsync();

            // Ensure __EFMigrationsHistory exists
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "CREATE TABLE IF NOT EXISTS \"__EFMigrationsHistory\" (\n  \"MigrationId\" TEXT NOT NULL CONSTRAINT \"PK___EFMigrationsHistory\" PRIMARY KEY,\n  \"ProductVersion\" TEXT NOT NULL\n);";
                await cmd.ExecuteNonQueryAsync();
            }

            // If the Notes table exists but the initial migration isn't recorded, insert a baseline row
            var initialMigrationId = "20250828061536_AddStage2Fields";
            bool notesExists;
            bool initialRecorded;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT 1 FROM sqlite_master WHERE type='table' AND name='Notes' LIMIT 1;";
                notesExists = (await cmd.ExecuteScalarAsync()) != null;
            }
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT 1 FROM \"__EFMigrationsHistory\" WHERE \"MigrationId\" = @mid LIMIT 1;";
                cmd.Parameters.AddWithValue("@mid", initialMigrationId);
                initialRecorded = (await cmd.ExecuteScalarAsync()) != null;
            }
            if (notesExists && !initialRecorded)
            {
                using var ins = conn.CreateCommand();
                ins.CommandText = "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES (@mid, @pv);";
                ins.Parameters.AddWithValue("@mid", initialMigrationId);
                // Use the current EF Core version if available, otherwise a sensible default
                var efVersion = typeof(DbContext).Assembly.GetName().Version?.ToString() ?? "8.0.0";
                ins.Parameters.AddWithValue("@pv", efVersion);
                await ins.ExecuteNonQueryAsync();
                Console.WriteLine($"[DB] Baseline migration recorded: {initialMigrationId}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DB] Baseline check failed (non-fatal): {ex.Message}");
        }

        Console.WriteLine("[DB] Applying migrations...");
        context.Database.Migrate();
        Console.WriteLine("[DB] Migrations applied successfully");

        // Post-migration sanity check & self-heal for known drift cases (SQLite only)
        try
        {
            using var conn2 = new SqliteConnection(absoluteSqliteConnectionString);
            await conn2.OpenAsync();

            // Database schema is now managed entirely through EF Core migrations
            // Manual table creation code removed - use migrations for schema changes
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DB] Post-migration self-heal skipped/failed: {ex.Message}");
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

    // Bootstrap configuration from appsettings to database (one-time only)
    try
    {
        var configService = scope.ServiceProvider.GetRequiredService<IConfigurationService>();
        await configService.BootstrapConfigurationAsync();
        // Reload configuration from database for immediate use
        await configService.ReloadConfigurationAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Config] Bootstrap failed: {ex.Message}");
    }
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

//// Health check endpoint
//app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
//.WithName("HealthCheck");

app.Run();

// Request models
public record FolderIngestRequest(string Path);
