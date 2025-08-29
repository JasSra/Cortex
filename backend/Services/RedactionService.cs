using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CortexApi.Services;

public interface IRedactionService
{
    Task<RedactionPreviewResponse> PreviewRedactionAsync(string noteId, string policy = "default");
    Task<string> RedactTextAsync(string text, int sensitivityLevel, List<TextSpan> spans);
    Task<bool> VerifyVoicePinAsync(string pin, string userId = "default");
    Task SetVoicePinAsync(string pin, string userId = "default");
}

public class RedactionService : IRedactionService
{
    private readonly CortexDbContext _context;
    private readonly IPiiDetectionService _piiService;
    private readonly ISecretsDetectionService _secretsService;
    private readonly ILogger<RedactionService> _logger;
    
    // Redaction policies by sensitivity level
    private readonly Dictionary<int, RedactionPolicy> _policies = new()
    {
        { 0, new RedactionPolicy { MaskPii = false, MaskSecrets = false, RequirePin = false } }, // Public
        { 1, new RedactionPolicy { MaskPii = false, MaskSecrets = true, RequirePin = false } },  // Internal
        { 2, new RedactionPolicy { MaskPii = true, MaskSecrets = true, RequirePin = true } },   // Confidential
        { 3, new RedactionPolicy { MaskPii = true, MaskSecrets = true, RequirePin = true } }    // Secret
    };

    public RedactionService(
        CortexDbContext context,
        IPiiDetectionService piiService,
        ISecretsDetectionService secretsService,
        ILogger<RedactionService> logger)
    {
        _context = context;
        _piiService = piiService;
        _secretsService = secretsService;
        _logger = logger;
    }

    public async Task<RedactionPreviewResponse> PreviewRedactionAsync(string noteId, string policy = "default")
    {
        var note = await _context.Notes
            .Include(n => n.Spans)
            .FirstOrDefaultAsync(n => n.Id == noteId);

        if (note == null)
        {
            throw new ArgumentException($"Note {noteId} not found");
        }

        // If no spans exist, create them from PII/secrets detection
        if (!note.Spans.Any())
        {
            await GenerateSpansForNoteAsync(note);
        }

        var maskedText = await RedactTextAsync(note.Content, note.SensitivityLevel, note.Spans.ToList());

        return new RedactionPreviewResponse
        {
            NoteId = noteId,
            MaskedText = maskedText,
            Spans = note.Spans.ToList(),
            SensitivityLevel = note.SensitivityLevel
        };
    }

    public Task<string> RedactTextAsync(string text, int sensitivityLevel, List<TextSpan> spans)
    {
        if (string.IsNullOrEmpty(text) || !spans.Any())
        {
            return Task.FromResult(text);
        }

        var policy = _policies.GetValueOrDefault(sensitivityLevel, _policies[2]); // Default to Confidential
        
        // Sort spans by start position in reverse order to avoid offset issues
        var sortedSpans = spans.OrderByDescending(s => s.Start).ToList();
        
        var result = text;
        
        foreach (var span in sortedSpans)
        {
            if (span.Start < 0 || span.End > result.Length || span.Start >= span.End)
                continue;

            var shouldMask = ShouldMaskSpan(span.Label, policy);
            if (shouldMask)
            {
                var originalText = result.Substring(span.Start, span.End - span.Start);
                var maskedText = GenerateMask(originalText, span.Label);
                result = result.Substring(0, span.Start) + maskedText + result.Substring(span.End);
            }
        }

    return Task.FromResult(result);
    }

    public async Task<bool> VerifyVoicePinAsync(string pin, string userId = "default")
    {
        try
        {
            var profile = await GetOrCreateProfileAsync(userId);
            var storedPinHash = profile.VoicePinHash;
            if (string.IsNullOrEmpty(storedPinHash))
            {
                return false; // No PIN set
            }

            var providedHash = HashPin(pin);
            return storedPinHash == providedHash;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying voice PIN for user {UserId}", userId);
            return false;
        }
    }

    public async Task SetVoicePinAsync(string pin, string userId = "default")
    {
        try
        {
            var profile = await GetOrCreateProfileAsync(userId);
            profile.VoicePinHash = HashPin(pin);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting voice PIN for user {UserId}", userId);
            throw;
        }
    }

    private async Task GenerateSpansForNoteAsync(Note note)
    {
        try
        {
            // Generate PII spans
            var piiResults = await _piiService.DetectPiiAsync(note.Content);
            foreach (var pii in piiResults)
            {
                var span = new TextSpan
                {
                    NoteId = note.Id,
                    Start = pii.Start,
                    End = pii.End,
                    Label = $"PII_{pii.Type}",
                    Confidence = pii.Confidence
                };
                note.Spans.Add(span);
            }

            // Generate secrets spans
            var secretResults = await _secretsService.DetectSecretsAsync(note.Content);
            foreach (var secret in secretResults)
            {
                var span = new TextSpan
                {
                    NoteId = note.Id,
                    Start = secret.Start,
                    End = secret.End,
                    Label = $"SECRET_{secret.Type}",
                    Confidence = 1.0
                };
                note.Spans.Add(span);
            }

            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating spans for note {NoteId}", note.Id);
        }
    }

    private bool ShouldMaskSpan(string label, RedactionPolicy policy)
    {
        if (label.StartsWith("PII_"))
        {
            return policy.MaskPii;
        }
        
        if (label.StartsWith("SECRET_"))
        {
            return policy.MaskSecrets;
        }

        return false;
    }

    private string GenerateMask(string originalText, string label)
    {
        var maskChar = GetMaskCharacter(label);
        
        // For very short text, show partial content
        if (originalText.Length <= 3)
        {
            return new string(maskChar, originalText.Length);
        }

        // For emails, show first char and domain
        if (label.Contains("EMAIL"))
        {
            var atIndex = originalText.IndexOf('@');
            if (atIndex > 0)
            {
                return originalText[0] + new string(maskChar, atIndex - 1) + originalText.Substring(atIndex);
            }
        }

        // For phone numbers, show last 4 digits
        if (label.Contains("PHONE"))
        {
            var digits = Regex.Replace(originalText, @"[^\d]", "");
            if (digits.Length >= 4)
            {
                var lastFour = digits.Substring(digits.Length - 4);
                var maskedPart = new string(maskChar, originalText.Length - 4);
                return maskedPart + lastFour;
            }
        }

        // Default: show first and last character with masking in between
        if (originalText.Length >= 6)
        {
            return originalText[0] + new string(maskChar, originalText.Length - 2) + originalText[^1];
        }
        
        return new string(maskChar, originalText.Length);
    }

    private char GetMaskCharacter(string label)
    {
        return label switch
        {
            var l when l.Contains("SECRET") => '█',
            var l when l.Contains("PII") => '●',
            _ => '▓'
        };
    }

    private async Task<UserProfile> GetOrCreateProfileAsync(string userId)
    {
        var profile = await _context.UserProfiles.FirstOrDefaultAsync(u => u.SubjectId == userId);
        if (profile == null)
        {
            profile = new UserProfile
            {
                SubjectId = userId,
                Email = $"{userId}@local",
                Name = userId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _context.UserProfiles.Add(profile);
            await _context.SaveChangesAsync();
        }
        return profile;
    }

    private string HashPin(string pin)
    {
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var hash = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(pin + "cortex_salt"));
        return Convert.ToBase64String(hash);
    }
}

internal class RedactionPolicy
{
    public bool MaskPii { get; set; }
    public bool MaskSecrets { get; set; }
    public bool RequirePin { get; set; }
}
