using CortexApi.Models;
using CortexApi.Data;
using CortexApi.Security;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace CortexApi.Services;

public interface IUrlIngestService
{
    Task<IngestResult?> IngestPdfFromUrlAsync(string url, string? title = null);
    Task<List<UrlIngestResult>> IngestUrlBatchAsync(List<string> urls, int maxConcurrent = 3);
}

public class UrlIngestService : IUrlIngestService
{
    private readonly IIngestService _ingestService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<UrlIngestService> _logger;
    private readonly IUserContextAccessor _userContext;
    private readonly string _dataDir;
    private readonly IConfigurationService _configurationService;

    public UrlIngestService(
        IIngestService ingestService,
        IHttpClientFactory httpClientFactory,
        ILogger<UrlIngestService> logger,
        IUserContextAccessor userContext,
        IConfigurationService configurationService)
    {
        _ingestService = ingestService;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _userContext = userContext;
        _configurationService = configurationService;
        var config = _configurationService.GetConfiguration();
        _dataDir = config["DATA_DIR"] ?? "./data";
    }

    public async Task<IngestResult?> IngestPdfFromUrlAsync(string url, string? title = null)
    {
        var httpClient = _httpClientFactory.CreateClient();
        httpClient.Timeout = TimeSpan.FromMinutes(5); // 5 minute timeout for large PDFs
        httpClient.DefaultRequestHeaders.Add("User-Agent", 
            "Mozilla/5.0 (compatible; Cortex-Bot/1.0; +https://cortex.ai/bot)");

        try
        {
            _logger.LogInformation("Downloading PDF from {Url}", url);
            
            var response = await httpClient.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var contentType = response.Content.Headers.ContentType?.MediaType;
            if (contentType != "application/pdf")
            {
                throw new InvalidOperationException($"Expected PDF but got content type: {contentType}");
            }

            // Get file size and validate
            var contentLength = response.Content.Headers.ContentLength;
            if (contentLength.HasValue && contentLength.Value > 50 * 1024 * 1024) // 50MB limit
            {
                throw new InvalidOperationException("PDF too large (max 50MB)");
            }

            // Generate filename
            var fileName = ExtractFileNameFromUrl(url, title);
            
            // Save to temporary file
            var tempDir = Path.Combine(_dataDir, "temp");
            Directory.CreateDirectory(tempDir);
            var tempFilePath = Path.Combine(tempDir, $"{Guid.NewGuid()}_{fileName}");

            using (var fileStream = new FileStream(tempFilePath, FileMode.Create))
            {
                await response.Content.CopyToAsync(fileStream);
            }

            try
            {
                // Create IFormFile wrapper for the downloaded PDF
                var formFile = new TempFormFile(tempFilePath, fileName, "application/pdf");
                var formCollection = new FormFileCollection { formFile };

                // Use existing ingest service to process the file
                var results = await _ingestService.IngestFilesAsync(formCollection);
                
                return results.FirstOrDefault();
            }
            finally
            {
                // Clean up temp file
                try
                {
                    if (File.Exists(tempFilePath))
                        File.Delete(tempFilePath);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up temp file {TempFile}", tempFilePath);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading PDF from {Url}", url);
            throw;
        }
    }

    public async Task<List<UrlIngestResult>> IngestUrlBatchAsync(List<string> urls, int maxConcurrent = 3)
    {
        var results = new List<UrlIngestResult>();
        var semaphore = new SemaphoreSlim(maxConcurrent, maxConcurrent);
        
        var tasks = urls.Select(async url =>
        {
            await semaphore.WaitAsync();
            try
            {
                return await ProcessSingleUrlAsync(url);
            }
            finally
            {
                semaphore.Release();
            }
        });

        var completedResults = await Task.WhenAll(tasks);
        return completedResults.ToList();
    }

    private async Task<UrlIngestResult> ProcessSingleUrlAsync(string url)
    {
        try
        {
            _logger.LogInformation("Processing URL: {Url}", url);
            
            // For now, we'll use a simple HTTP client to fetch and extract
            // In a production system, you might want to use the same extraction
            // logic as the frontend or a more sophisticated service
            
            var httpClient = _httpClientFactory.CreateClient();
            httpClient.Timeout = TimeSpan.FromSeconds(30);
            httpClient.DefaultRequestHeaders.Add("User-Agent", 
                "Mozilla/5.0 (compatible; Cortex-Bot/1.0; +https://cortex.ai/bot)");

            var response = await httpClient.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
            
            if (contentType.Contains("application/pdf"))
            {
                // Handle PDF
                var pdfResult = await IngestPdfFromUrlAsync(url);
                return new UrlIngestResult
                {
                    OriginalUrl = url,
                    Status = pdfResult != null ? "success" : "error",
                    NoteId = pdfResult?.NoteId,
                    Title = pdfResult?.Title ?? "Unknown PDF",
                    CountChunks = pdfResult?.CountChunks ?? 0,
                    Error = pdfResult == null ? "Failed to process PDF" : null,
                    FetchedAt = DateTime.UtcNow
                };
            }
            else if (contentType.Contains("text/html"))
            {
                // Handle HTML - basic text extraction
                var html = await response.Content.ReadAsStringAsync();
                var textContent = ExtractTextFromHtml(html);
                var title = ExtractTitleFromHtml(html) ?? new Uri(url).Host;

                var ingestResult = await _ingestService.IngestSingleUrlAsync(
                    url, title, textContent, response.RequestMessage?.RequestUri?.ToString());

                return ingestResult ?? new UrlIngestResult
                {
                    OriginalUrl = url,
                    Status = "error",
                    Error = "Failed to ingest content",
                    FetchedAt = DateTime.UtcNow
                };
            }
            else
            {
                return new UrlIngestResult
                {
                    OriginalUrl = url,
                    Status = "error",
                    Error = $"Unsupported content type: {contentType}",
                    FetchedAt = DateTime.UtcNow
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing URL {Url}", url);
            return new UrlIngestResult
            {
                OriginalUrl = url,
                Status = "error",
                Error = ex.Message,
                FetchedAt = DateTime.UtcNow
            };
        }
    }

    private string ExtractFileNameFromUrl(string url, string? title)
    {
        if (!string.IsNullOrWhiteSpace(title))
        {
            // Sanitize title for filename
            var invalidChars = Path.GetInvalidFileNameChars();
            var sanitizedTitle = new string(title.Where(c => !invalidChars.Contains(c)).ToArray());
            if (!string.IsNullOrWhiteSpace(sanitizedTitle))
            {
                return $"{sanitizedTitle.Substring(0, Math.Min(50, sanitizedTitle.Length))}.pdf";
            }
        }

        try
        {
            var uri = new Uri(url);
            var pathSegment = uri.Segments.LastOrDefault();
            if (!string.IsNullOrWhiteSpace(pathSegment) && pathSegment.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                return Path.GetFileName(pathSegment);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to extract filename from URL {Url}", url);
        }

        return "document.pdf";
    }

    private string ExtractTextFromHtml(string html)
    {
        // Basic HTML text extraction (you might want to use a more sophisticated library)
        var text = System.Text.RegularExpressions.Regex.Replace(html, @"<[^>]+>", " ");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ");
        return text.Trim();
    }

    private string? ExtractTitleFromHtml(string html)
    {
        var titleMatch = System.Text.RegularExpressions.Regex.Match(
            html, @"<title[^>]*>([^<]*)</title>", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        
        return titleMatch.Success ? titleMatch.Groups[1].Value.Trim() : null;
    }
}

/// <summary>
/// Temporary implementation of IFormFile for downloaded files
/// </summary>
public class TempFormFile : IFormFile
{
    private readonly string _filePath;
    
    public TempFormFile(string filePath, string fileName, string contentType)
    {
        _filePath = filePath;
        FileName = fileName;
        Name = fileName;
        ContentType = contentType;
        Length = new FileInfo(filePath).Length;
    }

    public string ContentType { get; }
    public string ContentDisposition => $"attachment; filename=\"{FileName}\"";
    public IHeaderDictionary Headers => new HeaderDictionary();
    public long Length { get; }
    public string Name { get; }
    public string FileName { get; }

    public Stream OpenReadStream() => new FileStream(_filePath, FileMode.Open, FileAccess.Read);

    public void CopyTo(Stream target) => OpenReadStream().CopyTo(target);

    public async Task CopyToAsync(Stream target, CancellationToken cancellationToken = default)
    {
        using var source = OpenReadStream();
        await source.CopyToAsync(target, cancellationToken);
    }
}
