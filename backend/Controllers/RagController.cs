using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

/// <summary>
/// RAG (Retrieval-Augmented Generation) operations for AI-powered question answering
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class RagController : ControllerBase
{
    private readonly IRagService _ragService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<RagController> _logger;

    public RagController(
        IRagService ragService,
        IUserContextAccessor userContext,
        ILogger<RagController> logger)
    {
        _ragService = ragService;
        _userContext = userContext;
        _logger = logger;
    }

    /// <summary>
    /// Query the knowledge base using RAG approach (Reader role required)
    /// </summary>
    [HttpPost("query")]
    [ProducesResponseType(typeof(RagAnswer), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status499ClientClosedRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<RagAnswer>> Query(
        [FromBody] RagQueryRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (request.Messages == null || request.Messages.Count == 0)
            return BadRequest("Messages are required");

        _logger.LogInformation("RAG query from user {UserId} with {MessageCount} messages", 
            _userContext.UserId, request.Messages.Count);

        try
        {
            // Ensure user-scoped access to knowledge base
            var answer = await _ragService.AnswerAsync(request, _userContext.UserId, cancellationToken);

            _logger.LogInformation("RAG query completed for user {UserId}, returned {CitationCount} citations", 
                _userContext.UserId, answer.Citations?.Count ?? 0);

            return Ok(answer);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("RAG query cancelled for user {UserId}", _userContext.UserId);
            return StatusCode(499, new { error = "Request cancelled" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing RAG query for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to process query", details = ex.Message });
        }
    }

    /// <summary>
    /// Stream RAG responses (for real-time chat-like experience)
    /// </summary>
    [HttpPost("stream")]
    [Produces("text/event-stream")]
    public async Task<IActionResult> StreamQuery(
        [FromBody] RagQueryRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!Rbac.RequireRole(_userContext, "Reader"))
            return Forbid("Reader role required");

        if (request.Messages == null || request.Messages.Count == 0)
            return BadRequest("Messages are required");

        _logger.LogInformation("RAG streaming query from user {UserId}", _userContext.UserId);

        // Set up Server-Sent Events response
    Response.Headers.Append("Content-Type", "text/event-stream");
    Response.Headers.Append("Cache-Control", "no-cache");
    Response.Headers.Append("Connection", "keep-alive");

        try
        {
            // For now, fallback to regular query - streaming implementation would go here
            var answer = await _ragService.AnswerAsync(request, _userContext.UserId, cancellationToken);
            
            await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(answer)}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);

            return new EmptyResult();
        }
        catch (OperationCanceledException)
        {
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in RAG streaming for user {UserId}", _userContext.UserId);
            await Response.WriteAsync($"data: {{\"error\": \"Failed to process query\"}}\n\n", cancellationToken);
            return new EmptyResult();
        }
    }
}
