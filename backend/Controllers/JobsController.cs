using CortexApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class JobsController : ControllerBase
{
    private readonly IBackgroundJobService _jobs;
    private readonly ILogger<JobsController> _logger;

    public JobsController(IBackgroundJobService jobs, ILogger<JobsController> logger)
    {
        _jobs = jobs;
        _logger = logger;
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
                avgMs
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Jobs status failed");
            return Ok(new { summary = "Background workers are idle.", pending = 0, processed = 0, failed = 0, avgMs = 0 });
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
                    avgMs
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
