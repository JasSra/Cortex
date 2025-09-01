using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;

namespace CortexApi.Controllers;

[ApiController]
[Route("api/chat")]
[Authorize]
public class ChatToolsController : ControllerBase
{
    private readonly IChatToolsService _chatToolsService;
    private readonly ILogger<ChatToolsController> _logger;
    private readonly IUserContextAccessor _userContext;

    public ChatToolsController(
        IChatToolsService chatToolsService,
        ILogger<ChatToolsController> logger,
        IUserContextAccessor userContext)
    {
        _chatToolsService = chatToolsService;
        _logger = logger;
        _userContext = userContext;
    }

    /// <summary>
    /// Process chat with tools integration
    /// </summary>
    [HttpPost("tools")]
    public async Task<ActionResult<ChatToolsResponse>> ProcessChatWithTools([FromBody] ChatToolsRequest request)
    {
        try
        {
            _logger.LogInformation("Processing chat with tools for user {UserId}: {Query}", 
                _userContext.UserId, request.Query);

            var response = await _chatToolsService.ProcessChatWithToolsAsync(request);
            
            _logger.LogInformation("Chat tools response generated with {ToolCount} suggested tools", 
                response.SuggestedTools.Count);
                
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing chat with tools for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to process chat request" });
        }
    }

    /// <summary>
    /// Execute a specific tool
    /// </summary>
    [HttpPost("tools/execute")]
    public async Task<ActionResult<ToolResult>> ExecuteTool([FromBody] ToolRequest request)
    {
        try
        {
            _logger.LogInformation("Executing tool {Tool} for user {UserId}", 
                request.Tool, _userContext.UserId);

            var result = await _chatToolsService.ExecuteToolAsync(request);
            
            if (result.Success)
            {
                _logger.LogInformation("Tool {Tool} executed successfully", request.Tool);
                return Ok(result);
            }
            else
            {
                _logger.LogWarning("Tool {Tool} execution failed: {Error}", request.Tool, result.Error);
                return BadRequest(result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing tool {Tool} for user {UserId}", 
                request.Tool, _userContext.UserId);
            return StatusCode(500, new { error = "Failed to execute tool" });
        }
    }

    /// <summary>
    /// Get list of available tools
    /// </summary>
    [HttpGet("tools")]
    public ActionResult<List<string>> GetAvailableTools()
    {
        try
        {
            var tools = _chatToolsService.GetAvailableTools();
            return Ok(tools);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting available tools");
            return StatusCode(500, new { error = "Failed to get available tools" });
        }
    }
}
