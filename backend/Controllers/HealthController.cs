using System.Diagnostics;
using System.Text.Json;
using CortexApi.Data;
using CortexApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;

namespace CortexApi.Controllers;

public class HealthResponse
{
    public string Status { get; set; } = "ok"; // ok | degraded | error
    public HealthRedis Redis { get; set; } = new();
    public HealthEmbeddings Embeddings { get; set; } = new();
    public HealthOpenAI OpenAI { get; set; } = new();
    public HealthJobs Jobs { get; set; } = new();
    public HealthDb Db { get; set; } = new();
}

public class HealthRedis
{
    public bool Configured { get; set; }
    public bool Connected { get; set; }
    public long PingMs { get; set; }
    // Removed stream-level reporting now that we don't use Redis streams for jobs
}

public class StreamHealth
{
    public long Length { get; set; }
    public long PendingPEL { get; set; } // Pending messages in consumer group (true backlog)
}

public class HealthEmbeddings
{
    public string Provider { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;
    public int Dim { get; set; }
    public bool Ok { get; set; }
    public int LatencyMs { get; set; }
    public string? Error { get; set; }
}

public class HealthOpenAI
{
    public bool Configured { get; set; }
    public bool Reachable { get; set; }
    public int LatencyMs { get; set; }
    public string? Error { get; set; }
}

public class HealthJobs
{
    public int Pending { get; set; }
    public int ProcessedRecently { get; set; }
    public int PendingStreams { get; set; }
    public int PendingBacklog { get; set; }
    public bool UsingStreams { get; set; }
    public bool RedisConnected { get; set; }
}

public class HealthDb
{
    public bool Ok { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string? DataSource { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IConfigurationService _configurationService;
    private readonly IEmbeddingService _embedding;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IBackgroundJobService _jobs;
    private readonly HttpClient _http;

    public HealthController(IConfigurationService configurationService, IEmbeddingService embedding, IServiceScopeFactory scopeFactory, IBackgroundJobService jobs, HttpClient http)
    {
        _configurationService = configurationService;
        _embedding = embedding;
        _scopeFactory = scopeFactory;
        _jobs = jobs;
        _http = http;
    }

    [HttpGet("/health")]
    public async Task<IActionResult> Get()
    {
        var resp = new HealthResponse();
        var status = "ok";

        // DB quick check
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CortexDbContext>();
            await db.Database.ExecuteSqlRawAsync("SELECT 1");
            resp.Db.Ok = true;
            var provider = db.Database.ProviderName ?? string.Empty;
            resp.Db.Provider = provider;
            if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
            {
                resp.Db.DataSource = db.Database.GetConnectionString();
            }
        }
        catch
        {
            resp.Db.Ok = false;
            status = "degraded";
        }

        // Jobs
        try
        {
            var stats = await _jobs.GetStatsAsync();
            resp.Jobs.Pending = stats.PendingJobs;
            resp.Jobs.ProcessedRecently = stats.ProcessedJobs;
            resp.Jobs.PendingStreams = stats.PendingStreams;
            resp.Jobs.PendingBacklog = stats.PendingBacklog;
            resp.Jobs.UsingStreams = stats.UsingStreams;
            resp.Jobs.RedisConnected = stats.RedisConnected;
            if (!stats.RedisConnected && stats.UsingStreams) status = "degraded";
        }
        catch { status = "degraded"; }

        // Redis: optional ping only (no streams)
        await PingRedisAsync(resp);
        if (resp.Redis.Configured && !resp.Redis.Connected) status = "degraded";

        // Embedding provider check (end-to-end invoke)
        var config = _configurationService.GetConfiguration();
        var embedSw = Stopwatch.StartNew();
        try
        {
            var dim = _embedding.GetEmbeddingDim();
            var vec = await _embedding.EmbedAsync("health-check", HttpContext.RequestAborted);
            embedSw.Stop();
            
            resp.Embeddings.Provider = config["Embedding:Provider"] ?? "openai";
            resp.Embeddings.Model = config["Embedding:Model"] ?? "text-embedding-3-small";
            resp.Embeddings.Dim = dim;
            resp.Embeddings.Ok = vec != null && vec.Length == dim;
            resp.Embeddings.LatencyMs = (int)embedSw.ElapsedMilliseconds;
            if (!resp.Embeddings.Ok) status = "degraded";
        }
        catch (Exception ex)
        {
            embedSw.Stop();
            resp.Embeddings.Ok = false;
            resp.Embeddings.Error = ex.Message;
            status = "degraded";
        }

        // OpenAI key reachability (only if configured)
        var apiKey = config["OpenAI:ApiKey"] ?? config["OPENAI_API_KEY"];
        resp.OpenAI.Configured = !string.IsNullOrWhiteSpace(apiKey);
        if (resp.OpenAI.Configured)
        {
            var sw = Stopwatch.StartNew();
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                _http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
                using var req = new HttpRequestMessage(HttpMethod.Get, "https://api.openai.com/v1/models");
                using var r = await _http.SendAsync(req, cts.Token);
                sw.Stop();
                resp.OpenAI.LatencyMs = (int)sw.ElapsedMilliseconds;
                resp.OpenAI.Reachable = r.IsSuccessStatusCode || (int)r.StatusCode == 401 || (int)r.StatusCode == 403; // 401/403 means reachable/key checked
                if (!resp.OpenAI.Reachable) status = "degraded";
            }
            catch (Exception ex)
            {
                resp.OpenAI.Reachable = false;
                resp.OpenAI.Error = ex.Message;
                status = "degraded";
            }
        }

        resp.Status = status;
        return Ok(resp);
    }

    private async Task PingRedisAsync(HealthResponse resp)
    {
        var config = _configurationService.GetConfiguration();
        var redisConfig = config["REDIS_CONNECTION"] ?? config["Redis:Connection"] ?? config.GetConnectionString("Redis");
        resp.Redis.Configured = !string.IsNullOrWhiteSpace(redisConfig);
        if (!resp.Redis.Configured) return;

        try
        {
            var cfg = redisConfig ?? string.Empty;
            var mux = await ConnectionMultiplexer.ConnectAsync(cfg);
            var sw = Stopwatch.StartNew();
            await mux.GetDatabase().PingAsync();
            sw.Stop();
            resp.Redis.Connected = true;
            resp.Redis.PingMs = sw.ElapsedMilliseconds;
        }
        catch
        {
            resp.Redis.Connected = false;
        }
    }
}
