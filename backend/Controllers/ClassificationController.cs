using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
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
[Authorize]
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
            return Forbid();

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
                Pii = piiDetections.Select(p => p.Type).ToList(),
                Secrets = secretDetections.Select(s => s.Type).ToList(),
                Summary = classificationResult.Summary,
                Confidence = classificationResult.Confidence,
                ProcessedAt = DateTime.UtcNow
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error classifying note {NoteId}", noteId);
            return StatusCode(500, new { error = "Failed to classify note" });
        }
    }

    /// <summary>
    /// Bulk classification for multiple notes
    /// </summary>
    [HttpPost("bulk")]
    public async Task<IActionResult> ClassifyBulk([FromBody] BulkClassificationRequest request)
    {
        if (!Rbac.RequireRole(_userContext, "Editor"))
            return Forbid();

        if (request?.NoteIds?.Any() != true)
            return BadRequest("NoteIds is required and cannot be empty");

        if (request.NoteIds.Count > 100)
            return BadRequest("Cannot classify more than 100 notes at once");

        try
        {
            var notes = await _context.Notes
                .Where(n => request.NoteIds.Contains(n.Id) && n.UserId == _userContext.UserId && !n.IsDeleted)
                .ToListAsync();

            if (notes.Count == 0)
                return NotFound("No valid notes found for classification");

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
                        Pii = piiDetections.Select(p => p.Type).ToList(),
                        Secrets = secretDetections.Select(s => s.Type).ToList(),
                        Summary = classificationResult.Summary,
                        Confidence = classificationResult.Confidence,
                        ProcessedAt = DateTime.UtcNow
                    });
                }
                catch (Exception exNote)
                {
                    _logger.LogError(exNote, "Error classifying note {NoteId}", note.Id);
                }
            }

            return Ok(new BulkClassificationResponse { Results = results });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during bulk classification for user {UserId}", _userContext.UserId);
            return StatusCode(500, new { error = "Failed to perform bulk classification" });
        }
    }

    private int CalculateSensitivityLevel(List<PiiDetection> pii, List<SecretDetection> secrets, ClassificationResult classification)
    {
        // Simple heuristic: secrets > pii > classification sensitivity
        if (secrets.Any()) return 3; // Secret
        if (pii.Any()) return 2;     // Confidential
        return Math.Max(1, classification.SensitivityLevel);
    }
}
