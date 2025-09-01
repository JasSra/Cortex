using CortexApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class JobsController : ControllerBase
{
    private readonly IBackgroundJobService _jobs;
    private readonly ILogger<JobsController> _logger;

    public JobsController(IBackgroundJobService jobs, ILogger<JobsController> logger)
    {
        _jobs = jobs;
        _logger = logger;
    }

    [HttpPost("graph-enrich")]
    public async Task<IActionResult> EnqueueGraphEnrich([FromBody] CortexApi.Services.GraphEnrichJobPayload? payload)
    {
        try
        {
            await _jobs.EnqueueJobAsync("graph_enrich", payload ?? new CortexApi.Services.GraphEnrichJobPayload());
            return Ok(new { enqueued = true, type = "graph_enrich", noteId = payload?.NoteId });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue graph enrichment job");
            return StatusCode(500, new { error = "Failed to enqueue job" });
        }
    }

    [HttpPost("graph-enrich/{noteId}")]
    public async Task<IActionResult> EnqueueGraphEnrichForNote(string noteId)
    {
        try
        {
            await _jobs.EnqueueJobAsync("graph_enrich", new CortexApi.Services.GraphEnrichJobPayload { NoteId = noteId });
            return Ok(new { enqueued = true, type = "graph_enrich", noteId });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue graph enrichment job for note {NoteId}", noteId);
            return StatusCode(500, new { error = "Failed to enqueue job" });
        }
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        try
        {
            var stats = await _jobs.GetStatsAsync();
            var avgMs = (int)stats.AverageProcessingTime.TotalMilliseconds;
            var summary = BuildSummary(stats.PendingJobs, stats.ProcessedJobs, stats.FailedJobs, avgMs);
            return Ok(new
            {
                summary,
                pending = stats.PendingJobs,
                processed = stats.ProcessedJobs,
                failed = stats.FailedJobs,
                avgMs,
                pendingStreams = stats.PendingStreams,
                pendingBacklog = stats.PendingBacklog,
                usingStreams = stats.UsingStreams,
                redisConnected = stats.RedisConnected,
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Jobs status failed");
            return Ok(new { summary = "Background workers are idle.", pending = 0, processed = 0, failed = 0, avgMs = 0 });
        }
    }

    [HttpGet("details")]
    public async Task<IActionResult> GetJobDetails()
    {
        try
        {
            var stats = await _jobs.GetStatsAsync();
            var avgMs = (int)stats.AverageProcessingTime.TotalMilliseconds;
            var summary = BuildSummary(stats.PendingJobs, stats.ProcessedJobs, stats.FailedJobs, avgMs);
            
            return Ok(new
            {
                summary,
                pending = stats.PendingJobs,
                processed = stats.ProcessedJobs,
                failed = stats.FailedJobs,
                avgMs,
                pendingStreams = stats.PendingStreams,
                pendingBacklog = stats.PendingBacklog,
                usingStreams = stats.UsingStreams,
                redisConnected = stats.RedisConnected,
                streamDetails = stats.PendingStreams,
                lastUpdated = DateTime.UtcNow,
                performanceMetrics = new
                {
                    averageProcessingTimeMs = avgMs,
                    totalJobsThisSession = stats.ProcessedJobs,
                    currentQueueSize = stats.PendingJobs,
                    systemHealth = stats.RedisConnected ? "healthy" : "degraded"
                },
                jobTypes = new[]
                {
                    new { type = "embedding", description = "Text embedding generation for semantic search" },
                    new { type = "classification", description = "Document classification and tagging" },
                    new { type = "pii_detection", description = "Personal information detection and masking" },
                    new { type = "weekly_digest", description = "Weekly summary and insights generation" },
                    new { type = "graph_enrich", description = "Knowledge graph relationship discovery" }
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Jobs details request failed");
            return StatusCode(500, new { error = "Failed to retrieve job details", details = ex.Message });
        }
    }

    [HttpGet("pending")]
    public async Task<IActionResult> GetPending()
    {
        try
        {
            var items = await _jobs.GetPendingJobsAsync(200);
            // The JobDetailsItem maps to the OpenAPI JobDetails schema shape used by the frontend
            var result = items.Select(i => new {
                id = i.Id,
                type = i.Type,
                stream = i.Stream,
                enqueuedAt = i.EnqueuedAt,
                payload = i.Payload,
            });
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch pending jobs");
            return StatusCode(500, new { error = "Failed to fetch pending jobs" });
        }
    }

    private static string BuildSummary(int pending, int processed, int failed, int avgMs)
    {
    if (pending == 0 && processed == 0 && failed == 0)
            return "Background workers are idle.";

        var parts = new List<string>();
        if (pending > 0) parts.Add($"{pending} job(s) in the queue");
        if (processed > 0) parts.Add($"{processed} processed");
        if (failed > 0) parts.Add($"{failed} failed");
        if (avgMs > 0) parts.Add($"avg {avgMs} ms");
        return string.Join(", ", parts) + ".";
    }

    [HttpGet("status/stream")]
    public async Task StatusStream()
    {
    Response.Headers["Cache-Control"] = "no-cache";
    Response.Headers["Content-Type"] = "text/event-stream";
    Response.Headers["X-Accel-Buffering"] = "no";

        // Send an initial comment to establish the stream
        await Response.WriteAsync(": ok\n\n");
        await Response.Body.FlushAsync();

        var cancellation = HttpContext.RequestAborted;
        while (!cancellation.IsCancellationRequested)
        {
            try
            {
                var stats = await _jobs.GetStatsAsync(cancellation);
                var avgMs = (int)stats.AverageProcessingTime.TotalMilliseconds;
                var payload = System.Text.Json.JsonSerializer.Serialize(new
                {
                    summary = BuildSummary(stats.PendingJobs, stats.ProcessedJobs, stats.FailedJobs, avgMs),
                    pending = stats.PendingJobs,
                    processed = stats.ProcessedJobs,
                    failed = stats.FailedJobs,
                    avgMs,
                    pendingStreams = stats.PendingStreams,
                    pendingBacklog = stats.PendingBacklog,
                    usingStreams = stats.UsingStreams,
                    redisConnected = stats.RedisConnected,
                });
                await Response.WriteAsync($"data: {payload}\n\n");
                await Response.Body.FlushAsync();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Jobs status stream iteration failed");
                // send a ping to keep the stream alive
                await Response.WriteAsync(": ping\n\n");
                await Response.Body.FlushAsync();
            }

            // Throttle updates
            await Task.Delay(TimeSpan.FromSeconds(2), cancellation);
        }
    }
}
