using System.Text.RegularExpressions;
using CortexApi.Models;

namespace CortexApi.Services;

public interface IPiiDetectionService
{
    Task<List<PiiDetection>> DetectPiiAsync(string text);
    Task<List<TextSpan>> CreatePiiSpansAsync(string noteId, string text);
}

public class PiiDetectionService : IPiiDetectionService
{
    private readonly ILogger<PiiDetectionService> _logger;
    private readonly Dictionary<string, (Regex Pattern, string Type, double Confidence)> _piiPatterns;

    public PiiDetectionService(ILogger<PiiDetectionService> logger)
    {
        _logger = logger;
        _piiPatterns = InitializePiiPatterns();
    }

    public async Task<List<PiiDetection>> DetectPiiAsync(string text)
    {
        var detections = new List<PiiDetection>();

        foreach (var (key, (pattern, type, confidence)) in _piiPatterns)
        {
            try
            {
                var matches = pattern.Matches(text);
                foreach (Match match in matches)
                {
                    if (match.Success)
                    {
                        detections.Add(new PiiDetection
                        {
                            Type = type,
                            Value = MaskValue(match.Value, type),
                            Start = match.Index,
                            End = match.Index + match.Length,
                            Confidence = confidence
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error processing PII pattern {Pattern} for type {Type}", key, type);
            }
        }

        // Remove overlapping detections, keeping highest confidence
        var nonOverlapping = RemoveOverlappingDetections(detections);
        
        _logger.LogInformation("Detected {Count} PII items in text of length {Length}", 
            nonOverlapping.Count, text.Length);

        return await Task.FromResult(nonOverlapping);
    }

    public async Task<List<TextSpan>> CreatePiiSpansAsync(string noteId, string text)
    {
        var piiDetections = await DetectPiiAsync(text);
        var spans = new List<TextSpan>();

        foreach (var detection in piiDetections)
        {
            spans.Add(new TextSpan
            {
                NoteId = noteId,
                Start = detection.Start,
                End = detection.End,
                Label = $"PII_{detection.Type}",
                Confidence = detection.Confidence,
                CreatedAt = DateTime.UtcNow
            });
        }

        return spans;
    }

    private Dictionary<string, (Regex Pattern, string Type, double Confidence)> InitializePiiPatterns()
    {
        var patterns = new Dictionary<string, (Regex Pattern, string Type, double Confidence)>();

        try
        {
            // Australian Tax File Number (TFN) - 9 digits with optional spaces/dashes
            patterns["au_tfn"] = (
                new Regex(@"\b(?:TFN[\s:]*)?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                "AU_TFN", 0.85
            );

            // Australian Medicare Number - 10 digits + check digit
            patterns["au_medicare"] = (
                new Regex(@"\b(?:Medicare[\s:]*)?\d{4}[\s-]?\d{5}[\s-]?\d{1}\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                "AU_MEDICARE", 0.8
            );

            // Australian Business Number (ABN) - 11 digits
            patterns["au_abn"] = (
                new Regex(@"\b(?:ABN[\s:]*)?\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                "AU_ABN", 0.8
            );

            // Email addresses
            patterns["email"] = (
                new Regex(@"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", 
                    RegexOptions.Compiled),
                "EMAIL", 0.95
            );

            // Phone numbers (international and local formats)
            patterns["phone_intl"] = (
                new Regex(@"\b(?:\+?\d{1,4}[\s.-]?)?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}\b", 
                    RegexOptions.Compiled),
                "PHONE", 0.7
            );

            // Australian phone numbers (more specific)
            patterns["phone_au"] = (
                new Regex(@"\b(?:\+61[\s-]?)?(?:\(0\d\)|0\d)[\s-]?\d{4}[\s-]?\d{4}\b", 
                    RegexOptions.Compiled),
                "AU_PHONE", 0.85
            );

            // Credit card numbers (basic Luhn-like pattern)
            patterns["credit_card"] = (
                new Regex(@"\b(?:\d{4}[\s-]?){3}\d{4}\b", 
                    RegexOptions.Compiled),
                "CREDIT_CARD", 0.6
            );

            // IBAN (International Bank Account Number)
            patterns["iban"] = (
                new Regex(@"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}\b", 
                    RegexOptions.Compiled),
                "IBAN", 0.9
            );

            // SWIFT/BIC codes
            patterns["swift_bic"] = (
                new Regex(@"\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b", 
                    RegexOptions.Compiled),
                "SWIFT_BIC", 0.85
            );

            // US Social Security Number
            patterns["us_ssn"] = (
                new Regex(@"\b(?:SSN[\s:]*)?\d{3}[\s-]?\d{2}[\s-]?\d{4}\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                "US_SSN", 0.9
            );

            // Driver's license patterns (basic)
            patterns["drivers_license"] = (
                new Regex(@"\b(?:DL|License|Licence)[\s#:]*[A-Z0-9]{5,12}\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                "DRIVERS_LICENSE", 0.7
            );

            // Passport numbers (basic pattern)
            patterns["passport"] = (
                new Regex(@"\b(?:Passport)[\s#:]*[A-Z0-9]{6,9}\b", 
                    RegexOptions.IgnoreCase | RegexOptions.Compiled),
                "PASSPORT", 0.8
            );

            _logger.LogInformation("Initialized {Count} PII detection patterns", patterns.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initializing PII patterns");
        }

        return patterns;
    }

    private string MaskValue(string value, string type)
    {
        // Keep first and last few characters for context, mask the middle
        if (value.Length <= 4)
            return new string('*', value.Length);

        if (type == "EMAIL")
        {
            var atIndex = value.IndexOf('@');
            if (atIndex > 0)
            {
                var local = value.Substring(0, atIndex);
                var domain = value.Substring(atIndex);
                var maskedLocal = local.Length > 2 
                    ? local.Substring(0, 1) + new string('*', local.Length - 2) + local.Substring(local.Length - 1)
                    : new string('*', local.Length);
                return maskedLocal + domain;
            }
        }

        // General masking: show first and last character, mask middle
        return value.Length > 6 
            ? value.Substring(0, 2) + new string('*', value.Length - 4) + value.Substring(value.Length - 2)
            : value.Substring(0, 1) + new string('*', value.Length - 2) + value.Substring(value.Length - 1);
    }

    private List<PiiDetection> RemoveOverlappingDetections(List<PiiDetection> detections)
    {
        if (!detections.Any()) return detections;

        // Sort by start position
        var sorted = detections.OrderBy(d => d.Start).ToList();
        var result = new List<PiiDetection>();

        foreach (var current in sorted)
        {
            // Check if current overlaps with any detection already in result
            var overlaps = result.Any(existing => 
                (current.Start >= existing.Start && current.Start < existing.End) ||
                (current.End > existing.Start && current.End <= existing.End) ||
                (current.Start <= existing.Start && current.End >= existing.End));

            if (!overlaps)
            {
                result.Add(current);
            }
            else
            {
                // Keep the one with higher confidence
                var overlapping = result.Where(existing =>
                    (current.Start >= existing.Start && current.Start < existing.End) ||
                    (current.End > existing.Start && current.End <= existing.End) ||
                    (current.Start <= existing.Start && current.End >= existing.End)).ToList();

                if (overlapping.Any() && current.Confidence > overlapping.Max(o => o.Confidence))
                {
                    // Remove overlapping detections and add current
                    foreach (var toRemove in overlapping)
                    {
                        result.Remove(toRemove);
                    }
                    result.Add(current);
                }
            }
        }

        return result.OrderBy(d => d.Start).ToList();
    }
}
