using System.Text;
using System.Text.Json;

namespace CortexApi.Services;

public interface IEmbeddingService
{
    Task<float[]?> EmbedAsync(string text, CancellationToken ct = default);
    int GetEmbeddingDim();
}

public class EmbeddingService : IEmbeddingService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmbeddingService> _logger;

    public EmbeddingService(HttpClient httpClient, IConfiguration configuration, ILogger<EmbeddingService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public int GetEmbeddingDim()
    {
        if (int.TryParse(_configuration["Embedding:Dim"], out var dim))
            return dim;
        // Default for OpenAI text-embedding-3-small
        return 1536;
    }

    public async Task<float[]?> EmbedAsync(string text, CancellationToken ct = default)
    {
        var provider = _configuration["Embedding:Provider"] ?? "openai";
        var model = _configuration["Embedding:Model"] ?? "text-embedding-3-small";

        if (provider.Equals("openai", StringComparison.OrdinalIgnoreCase))
        {
            var apiKey = _configuration["OpenAI:ApiKey"] ?? _configuration["OPENAI_API_KEY"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("OpenAI API key not configured; cannot embed");
                return null;
            }

            var payload = new
            {
                model,
                input = text
            };
            var json = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            using var resp = await _httpClient.PostAsync("https://api.openai.com/v1/embeddings", json, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                _logger.LogError("OpenAI embeddings failed: {Status} {Body}", (int)resp.StatusCode, body);
                return null;
            }

            var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var data = doc.RootElement.GetProperty("data")[0].GetProperty("embedding");
            var arr = new float[data.GetArrayLength()];
            var i = 0;
            foreach (var v in data.EnumerateArray())
            {
                arr[i++] = v.GetSingle();
            }
            return arr;
        }

        // Local provider placeholder: simple hashing-based embedding to allow dev without network
        var dimLocal = GetEmbeddingDim();
        var vec = new float[dimLocal];
        unchecked
        {
            int h = 17;
            foreach (var ch in text)
            {
                h = h * 31 + ch;
                var idx = Math.Abs(h) % dimLocal;
                vec[idx] += 1f;
            }
        }
        // L2 normalize
        var norm = MathF.Sqrt(vec.Sum(v => v * v));
        if (norm > 0)
        {
            for (int i = 0; i < vec.Length; i++) vec[i] /= norm;
        }
        return vec;
    }
}
