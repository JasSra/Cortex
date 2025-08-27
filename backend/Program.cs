using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using CortexApi.Data;
using CortexApi.Services;
using CortexApi.Models;
using System.Net.WebSockets;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddDbContext<CortexDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddHttpClient();
builder.Services.AddScoped<IIngestService, IngestService>();
builder.Services.AddScoped<ISearchService, SearchService>();
builder.Services.AddScoped<IVoiceService, VoiceService>();
builder.Services.AddScoped<IChatService, ChatService>();

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
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

app.UseCors("AllowFrontend");
app.UseWebSockets();

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
    context.Database.EnsureCreated();
}

// API Endpoints

// POST /ingest/files
app.MapPost("/ingest/files", async (IFormFileCollection files, IIngestService ingestService) =>
{
    var results = await ingestService.IngestFilesAsync(files);
    return Results.Ok(results);
})
.WithName("IngestFiles")
.WithOpenApi();

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
.WithName("IngestFolder")
.WithOpenApi();

// GET /notes/{id}
app.MapGet("/notes/{id}", async (string id, IIngestService ingestService) =>
{
    var note = await ingestService.GetNoteAsync(id);
    return note != null ? Results.Ok(note) : Results.NotFound();
})
.WithName("GetNote")
.WithOpenApi();

// GET /search
app.MapGet("/search", async (string? q, int limit = 20, string? fileType = null, string? dateFrom = null, string? dateTo = null, ISearchService searchService) =>
{
    var filters = new Dictionary<string, string>();
    if (!string.IsNullOrEmpty(fileType)) filters["fileType"] = fileType;
    if (!string.IsNullOrEmpty(dateFrom)) filters["dateFrom"] = dateFrom;
    if (!string.IsNullOrEmpty(dateTo)) filters["dateTo"] = dateTo;
    
    var results = await searchService.SearchAsync(q ?? "", limit, filters);
    return Results.Ok(results);
})
.WithName("Search")
.WithOpenApi();

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
.WithName("TextToSpeech")
.WithOpenApi();

// POST /chat/stream
app.MapPost("/chat/stream", async (ChatRequest request, HttpContext context, IChatService chatService) =>
{
    await chatService.StreamChatResponseAsync(request.Prompt, request.Provider, context);
})
.WithName("ChatStream")
.WithOpenApi();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
.WithName("HealthCheck")
.WithOpenApi();

app.Run();

// Request models
public record FolderIngestRequest(string Path);
