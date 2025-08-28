using Microsoft.AspNetCore.Mvc;
using CortexApi.Models;
using CortexApi.Services;
using CortexApi.Security;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Controllers;

/// <summary>
/// Auto-classification operations for Stage 2
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class ClassificationController : ControllerBase
{
    private readonly IClassificationService _classificationService;
    private readonly IPiiDetectionService _piiDetectionService;
    private readonly ISecretsDetectionService _secretsDetectionService;
    private readonly IUserContextAccessor _userContext;
    private readonly ILogger<ClassificationController> _logger;
    private readonly CortexDbContext _context;

    public ClassificationController(
        IClassificationService classificationService,
        IPiiDetectionService piiDetectionService,
        ISecretsDetectionService secretsDetectionService,
        IUserContextAccessor userContext,
        ILogger<ClassificationController> logger,
        CortexDbContext context)
    {
        _classificationService = classificationService;
        _piiDetectionService = piiDetectionService;
        _secretsDetectionService = secretsDetectionService;
        _userContext = userContext;
        _logger = logger;
        _context = context;
    }

    /// <summary>
    /// Classify a specific note and return classification results
    /// </summary>
    [HttpPost("{noteId}")]
    public async Task<IActionResult> ClassifyNote(string noteId)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return Forbid("Editor role required");

        _logger.LogInformation("Classification requested for note {NoteId} by user {UserId}", 
            noteId, _userContext.UserId);

        // Get the note
        var note = await _context.Notes
            .FirstOrDefaultAsync(n => n.Id == noteId && n.UserId == _userContext.UserId && !n.IsDeleted);

        if (note == null)
            return NotFound($"Note {noteId} not found");

        try
        {
            // Perform classification
            var classificationResult = await _classificationService.ClassifyTextAsync(note.Content, note.Id);
            var piiDetections = await _piiDetectionService.DetectPiiAsync(note.Content);
            var secretDetections = await _secretsDetectionService.DetectSecretsAsync(note.Content);

            // Calculate sensitivity level based on detections
            var sensitivityLevel = CalculateSensitivityLevel(piiDetections, secretDetections, classificationResult);

            // Prepare response
            var response = new ClassificationResponse
            {
                NoteId = noteId,
                Tags = classificationResult.Tags?.Take(5).Select(t => t.Name).ToList() ?? new List<string>(),
                Sensitivity = sensitivityLevel,
                SensitivityScore = classificationResult.SensitivityLevel, // Use SensitivityLevel instead of SensitivityScore
                Pii = piiDetections.Select(p => p.Type).Distinct().ToList(),
                Secrets = secretDetections.Select(s => s.Type).Distinct().ToList(),
                Summary = GenerateSummary(note.Content, classificationResult),
                Confidence = classificationResult.Tags?.FirstOrDefault()?.Confidence ?? 0.0,
                ProcessedAt = DateTime.UtcNow
            };

            _logger.LogInformation("Classification completed for note {NoteId}: sensitivity={Sensitivity}, tags={TagCount}, pii={PiiCount}, secrets={SecretCount}", 
                noteId, sensitivityLevel, response.Tags.Count, response.Pii.Count, response.Secrets.Count);

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Classification failed for note {NoteId}", noteId);
            return StatusCode(500, "Classification failed");
        }
    }

    /// <summary>
    /// Bulk classification for multiple notes
    /// </summary>
    [HttpPost("bulk")]
    public async Task<IActionResult> ClassifyBulk([FromBody] BulkClassificationRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return Forbid("Editor role required");

        if (request.NoteIds?.Any() != true)
            return BadRequest("NoteIds is required and cannot be empty");

        if (request.NoteIds.Count > 100)
            return BadRequest("Cannot classify more than 100 notes at once");

        _logger.LogInformation("Bulk classification requested for {Count} notes by user {UserId}", 
            request.NoteIds.Count, _userContext.UserId);

        try
        {
            var notes = await _context.Notes
                .Where(n => request.NoteIds.Contains(n.Id) && n.UserId == _userContext.UserId && !n.IsDeleted)
                .ToListAsync();

            var results = new List<ClassificationResponse>();

            foreach (var note in notes)
            {
                try
                {
                    var classificationResult = await _classificationService.ClassifyTextAsync(note.Content, note.Id);
                    var piiDetections = await _piiDetectionService.DetectPiiAsync(note.Content);
                    var secretDetections = await _secretsDetectionService.DetectSecretsAsync(note.Content);

                    var sensitivityLevel = CalculateSensitivityLevel(piiDetections, secretDetections, classificationResult);

                    results.Add(new ClassificationResponse
                    {
                        NoteId = note.Id,
                        Tags = classificationResult.Tags?.Take(5).Select(t => t.Name).ToList() ?? new List<string>(),
                        Sensitivity = sensitivityLevel,
                        SensitivityScore = classificationResult.SensitivityLevel,
                        Pii = piiDetections.Select(p => p.Type).Distinct().ToList(),
                        Secrets = secretDetections.Select(s => s.Type).Distinct().ToList(),
                        Summary = GenerateSummary(note.Content, classificationResult),
                        Confidence = classificationResult.Tags?.FirstOrDefault()?.Confidence ?? 0.0,
                        ProcessedAt = DateTime.UtcNow
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Classification failed for note {NoteId}", note.Id);
                    results.Add(new ClassificationResponse
                    {
                        NoteId = note.Id,
                        Tags = new List<string>(),
                        Sensitivity = 0,
                        SensitivityScore = 0.0,
                        Pii = new List<string>(),
                        Secrets = new List<string>(),
                        Summary = "Classification failed",
                        Confidence = 0.0,
                        ProcessedAt = DateTime.UtcNow,
                        Error = "Classification processing failed"
                    });
                }
            }

            _logger.LogInformation("Bulk classification completed: {SuccessCount}/{TotalCount} notes processed successfully", 
                results.Count(r => string.IsNullOrEmpty(r.Error)), results.Count);

            return Ok(new BulkClassificationResponse { Results = results });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Bulk classification failed");
            return StatusCode(500, "Bulk classification failed");
        }
    }

    private int CalculateSensitivityLevel(List<PiiDetection> piiDetections, List<SecretDetection> secretDetections, ClassificationResult classificationResult)
    {
        // Start with ML classification score
        var baseLevel = classificationResult.SensitivityLevel;
        
        // Elevate based on detections
        if (secretDetections.Any())
        {
            baseLevel = Math.Max(baseLevel, 3); // Secrets always mean high sensitivity
        }
        
        if (piiDetections.Any())
        {
            var criticalPii = piiDetections.Any(p => 
                p.Type.Contains("ssn") || p.Type.Contains("credit") || p.Type.Contains("passport") || 
                p.Type.Contains("medicare") || p.Type.Contains("tfn"));
            
            baseLevel = Math.Max(baseLevel, criticalPii ? 3 : 2);
        }

        return Math.Clamp(baseLevel, 0, 3);
    }

    private string GenerateSummary(string content, ClassificationResult classificationResult)
    {
        if (string.IsNullOrWhiteSpace(content))
            return "Empty content";

        // Simple extractive summary - take first 200 chars with topic context
        var summary = content.Length > 200 ? content.Substring(0, 200).Trim() + "..." : content;
        
        if (classificationResult.Tags?.Any() == true)
        {
            var topTag = classificationResult.Tags.First().Name;
            return $"[{topTag}] {summary}";
        }

        return summary;
    }
}
