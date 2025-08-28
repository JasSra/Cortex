using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using CortexApi.Data;
using CortexApi.Services;
using CortexApi.Models;
using System.Net.WebSockets;
using System.Data;
using Microsoft.Data.Sqlite;

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
builder.Services.AddHostedService<BackgroundJobService>();
builder.Services.AddScoped<IRagService, RagService>();

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

// API Endpoints

// POST /ingest/files
app.MapPost("/ingest/files", async (IFormFileCollection files, IIngestService ingestService) =>
{
    var results = await ingestService.IngestFilesAsync(files);
    return Results.Ok(results);
})
.WithName("IngestFiles");

// POST /ingest/folder
app.MapPost("/ingest/folder", async (FolderIngestRequest request, IIngestService ingestService) =>
{
    try
    {
        var results = await ingestService.IngestFolderAsync(request.Path);
        return Results.Ok(results);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.StatusCode(403);
    }
})
.WithName("IngestFolder");

// GET /notes/{id}
app.MapGet("/notes/{id}", async (string id, IIngestService ingestService) =>
{
    var note = await ingestService.GetNoteAsync(id);
    return note != null ? Results.Ok(note) : Results.NotFound();
})
.WithName("GetNote");

// POST /search (Stage1)
app.MapPost("/search", async (SearchRequest req, ISearchService searchService, HttpContext ctx) =>
{
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var resp = await searchService.SearchHybridAsync(req, userId);
    return Results.Ok(resp);
})
.WithName("Search");

// GET /search (compat: allow simple query via query string)
app.MapGet("/search", async (HttpContext ctx, ISearchService searchService) =>
{
    var q = ctx.Request.Query["q"].FirstOrDefault() ?? string.Empty;
    // support both "k" and legacy "limit"
    var kParam = ctx.Request.Query["k"].FirstOrDefault() ?? ctx.Request.Query["limit"].FirstOrDefault();
    int k = 10;
    if (!string.IsNullOrWhiteSpace(kParam) && int.TryParse(kParam, out var kParsed)) k = kParsed;

    var mode = ctx.Request.Query["mode"].FirstOrDefault() ?? "hybrid";
    var alphaParam = ctx.Request.Query["alpha"].FirstOrDefault();
    double alpha = 0.6;
    if (!string.IsNullOrWhiteSpace(alphaParam) && double.TryParse(alphaParam, out var aParsed)) alpha = aParsed;

    var req = new SearchRequest { Q = q, K = k, Mode = mode, Alpha = alpha };
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var resp = await searchService.SearchHybridAsync(req, userId);
    return Results.Ok(resp);
});

// WS /voice/stt
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

// POST /voice/tts
app.MapPost("/voice/tts", async (VoiceTtsRequest request, IVoiceService voiceService) =>
{
    var audioData = await voiceService.GenerateTtsAsync(request.Text);
    return Results.File(audioData, "audio/wav");
})
.WithName("TextToSpeech");

// POST /chat/stream
app.MapPost("/chat/stream", async (ChatRequest request, HttpContext context, IChatService chatService) =>
{
    await chatService.StreamChatResponseAsync(request.Prompt, request.Provider, context);
})
.WithName("ChatStream");

// POST /rag/query
app.MapPost("/rag/query", async (RagQueryRequest req, IRagService ragService, HttpContext ctx) =>
{
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var answer = await ragService.AnswerAsync(req, userId, ctx.RequestAborted);
    return Results.Ok(answer);
});

// Admin endpoints: reindex/reembed
app.MapPost("/admin/reindex", async (HttpContext ctx) =>
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var notes = await db.Notes.Where(n => !n.IsDeleted && n.UserId == userId).Select(n => n.Id).ToListAsync();
    foreach (var nid in notes) await vector.RemoveNoteAsync(nid);
    return Results.Ok(new { status = "ok", removed = notes.Count });
});

app.MapPost("/admin/reembed", async (HttpContext ctx) =>
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var embeds = db.Set<Embedding>().Where(e => db.NoteChunks.Any(c => c.Id == e.ChunkId && db.Notes.Any(n => n.Id == c.NoteId && n.UserId == userId)));
    db.RemoveRange(embeds);
    await db.SaveChangesAsync();
    return Results.Ok(new { status = "ok" });
});

app.MapPost("/admin/embed/reindex", async (HttpContext ctx) =>
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var notes = await db.Notes.Where(n => !n.IsDeleted && n.UserId == userId).Select(n => n.Id).ToListAsync();
    foreach (var nid in notes) await vector.RemoveNoteAsync(nid);
    return Results.Ok(new { status = "ok", removed = notes.Count });
});

app.MapPost("/admin/embed/reembed", async (HttpContext ctx) =>
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    var embeds = db.Set<Embedding>().Where(e => db.NoteChunks.Any(c => c.Id == e.ChunkId && db.Notes.Any(n => n.Id == c.NoteId && n.UserId == userId)));
    db.RemoveRange(embeds);
    await db.SaveChangesAsync();
    return Results.Ok(new { status = "ok" });
});

// POST /agent/act (Stage1 tools subset)
app.MapPost("/agent/act", async (AgentActRequest req, HttpContext ctx) =>
{
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var vector = scope.ServiceProvider.GetRequiredService<IVectorService>();

    var sw = System.Diagnostics.Stopwatch.StartNew();
    string status = "ok";
    object result;
    try
    {
        switch ((req.Tool ?? string.Empty).ToLowerInvariant())
        {
            case "createnote":
            {
                var title = req.Args.GetProperty("title").GetString() ?? "Untitled";
                var content = req.Args.TryGetProperty("content", out var ce) ? ce.GetString() ?? string.Empty : string.Empty;
                var note = new Note { Title = title, UserId = userId, Content = content, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
                var chunks = new List<NoteChunk>();
                if (!string.IsNullOrWhiteSpace(content))
                {
                    // naive single chunk
                    chunks.Add(new NoteChunk { NoteId = note.Id, Content = content, Text = content, ChunkIndex = 0, Seq = 0, TokenCount = content.Length });
                    note.ChunkCount = 1;
                    note.Chunks = chunks;
                }
                db.Notes.Add(note);
                await db.SaveChangesAsync();
                foreach (var ch in chunks)
                {
                    await vector.EnqueueEmbedAsync(note, ch);
                }
                result = new { note.Id, note.Title };
                break;
            }
            case "deletenote":
            {
                var noteId = req.Args.GetProperty("noteId").GetString() ?? string.Empty;
                var note = await db.Notes.FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == userId);
                if (note is null) { status = "not_found"; result = new { ok = false }; break; }
                note.IsDeleted = true;
                await db.SaveChangesAsync();
                await vector.RemoveNoteAsync(noteId);
                result = new { ok = true };
                break;
            }
            case "findnotes":
            {
                var q = req.Args.TryGetProperty("q", out var qj) ? qj.GetString() ?? string.Empty : string.Empty;
                var notes = await db.Notes.Where(n => !n.IsDeleted && n.UserId == userId && (n.Title.Contains(q) || n.Content.Contains(q))).OrderByDescending(n => n.UpdatedAt).Take(20).Select(n => new { n.Id, n.Title }).ToListAsync();
                result = new { items = notes };
                break;
            }
            case "tagnote":
            {
                var noteId = req.Args.GetProperty("noteId").GetString() ?? string.Empty;
                var tagName = req.Args.GetProperty("tag").GetString() ?? string.Empty;
                var note = await db.Notes.FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == userId);
                if (note is null) { status = "not_found"; result = new { ok = false }; break; }
                var tag = await db.Set<Tag>().FirstOrDefaultAsync(t => t.Name == tagName) ?? new Tag { Name = tagName };
                if (tag.Id == 0) db.Add(tag);
                db.Add(new NoteTag { NoteId = note.Id, Tag = tag });
                await db.SaveChangesAsync();
                result = new { ok = true };
                break;
            }
            case "summarisenote":
            {
                var noteId = req.Args.GetProperty("noteId").GetString() ?? string.Empty;
                var note = await db.Notes.Include(n => n.Chunks).FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == userId);
                if (note is null) { status = "not_found"; result = new { ok = false }; break; }
                var text = string.Join("\n\n", note.Chunks.OrderBy(c => c.ChunkIndex).Select(c => c.Content));
                // naive extractive summary: first ~2 sentences or 400 chars
                var summary = text;
                var periodIdx = summary.IndexOf('.', Math.Min(400, summary.Length - 1));
                if (periodIdx > 0) summary = summary.Substring(0, Math.Min(periodIdx + 1, summary.Length));
                if (summary.Length > 400) summary = summary.Substring(0, 400) + "…";
                result = new { summary };
                break;
            }
            default:
                status = "bad_tool";
                result = new { error = "unknown tool" };
                break;
        }
    }
    catch (Exception ex)
    {
        status = "error";
        result = new { error = ex.Message };
    }
    finally { sw.Stop(); }

    // Log action
    try
    {
        var log = new ActionLog
        {
            AgentSessionId = ctx.Request.Headers["X-SessionId"].FirstOrDefault() ?? "",
            Tool = req.Tool,
            InputJson = req.Args.ToString(),
            ResultJson = System.Text.Json.JsonSerializer.Serialize(result),
            Status = status,
            Latency_ms = (int)sw.ElapsedMilliseconds,
            Ts = DateTime.UtcNow
        };
        using var scope2 = app.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<CortexDbContext>();
        db2.Add(log);
        await db2.SaveChangesAsync();
    }
    catch { }

    return Results.Ok(new { status, result });
});

// Adaptive Cards endpoints (list notes and single note)
// Cards: Stage1 endpoints as POST
app.MapPost("/cards/list-notes", async (HttpContext ctx) =>
{
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var items = await db.Notes.Where(n => !n.IsDeleted && n.UserId == userId)
        .OrderByDescending(n => n.UpdatedAt)
        .Take(20)
        .Select(n => new { n.Id, n.Title, n.UpdatedAt })
        .ToListAsync();
    var card = new
    {
        type = "AdaptiveCard",
        version = "1.6",
        body = new object[]
        {
            new { type = "TextBlock", text = "Recent Notes", weight = "Bolder", size = "Medium" },
            new { type = "Container", items = items.Select(i => (object)new { type = "TextBlock", text = $"• {i.Title} ({i.Id[..8]})", wrap = true }) }
        }
    };
    return Results.Ok(card);
});

app.MapPost("/cards/note/{id}", async (string id, HttpContext ctx) =>
{
    var userId = ctx.Request.Headers["X-UserId"].FirstOrDefault() ?? "default";
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    var note = await db.Notes.Include(n => n.Chunks).FirstOrDefaultAsync(n => n.Id == id && n.UserId == userId);
    if (note is null) return Results.NotFound();
    var preview = string.Join("\n\n", note.Chunks.OrderBy(c => c.ChunkIndex).Select(c => c.Content.Length > 400 ? c.Content.Substring(0, 400) + "…" : c.Content).Take(3));
    var card = new
    {
        type = "AdaptiveCard",
        version = "1.6",
        body = new object[]
        {
            new { type = "TextBlock", text = note.Title, weight = "Bolder", size = "Large" },
            new { type = "TextBlock", text = preview, wrap = true }
        }
    };
    return Results.Ok(card);
});

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
.WithName("HealthCheck");

app.Run();

// Request models
public record FolderIngestRequest(string Path);
