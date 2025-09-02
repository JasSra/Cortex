using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using System.Text;
using Xunit;
using Xunit.Abstractions;

namespace CortexApi.Tests;

public class ChunkingTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;
    private readonly ITestOutputHelper _output;

    public ChunkingTests(WebApplicationFactory<Program> factory, ITestOutputHelper output)
    {
        _factory = factory;
        _output = output;
        _client = _factory.CreateClient();
        
        // Set development headers for testing
        _client.DefaultRequestHeaders.Add("X-UserId", "test-user");
        _client.DefaultRequestHeaders.Add("X-Roles", "Admin");
    }

    [Theory]
    [InlineData("This is a simple test document. It has multiple sentences. Each sentence should be preserved.", 1)]
    [InlineData("", 0)]
    [InlineData("   \n\n   \n   ", 0)]
    [InlineData("Single line", 1)]
    [InlineData("Line 1\nLine 2\nLine 3", 1)]
    [InlineData("This is a very long sentence that contains many words and should definitely exceed the token limit for a single chunk. " +
               "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " +
               "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. " +
               "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. " +
               "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. " +
               "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium. " +
               "Totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt. " +
               "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores. " +
               "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit. " +
               "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.", 1)]
    public async Task IngestText_ShouldCreateExpectedChunks(string content, int expectedChunks)
    {
        // Arrange
        var request = new
        {
            content = content,
            title = $"Test Note - Chunks: {expectedChunks}"
        };

        var json = JsonConvert.SerializeObject(request);
        var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

        // Act
        var response = await _client.PostAsync("/api/ingest/text", httpContent);
        
        // Assert
        response.EnsureSuccessStatusCode();
        var responseContent = await response.Content.ReadAsStringAsync();
        _output.WriteLine($"Response: {responseContent}");
        
        var result = JsonConvert.DeserializeObject<dynamic>(responseContent);
        int actualChunks = result.countChunks;
        
        Assert.Equal(expectedChunks, actualChunks);
    }

    [Fact]
    public async Task IngestText_WithEmptyLines_ShouldStripAndChunk()
    {
        // Arrange
        var content = @"
        
Line 1 with content

        
Line 2 with content


Line 3 with content
        
        ";

        var request = new
        {
            content = content,
            title = "Test Note - Empty Lines"
        };

        var json = JsonConvert.SerializeObject(request);
        var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

        // Act
        var response = await _client.PostAsync("/api/ingest/text", httpContent);
        
        // Assert
        response.EnsureSuccessStatusCode();
        var responseContent = await response.Content.ReadAsStringAsync();
        _output.WriteLine($"Response: {responseContent}");
        
        var result = JsonConvert.DeserializeObject<dynamic>(responseContent);
        int actualChunks = result.countChunks;
        
        // Should have at least 1 chunk since there's real content
        Assert.True(actualChunks > 0, "Content with empty lines should still produce chunks");
    }

    [Fact]
    public async Task IngestText_OnlyWhitespace_ShouldCreateZeroChunks()
    {
        // Arrange
        var content = "   \n\n   \t\t\t   \n   ";

        var request = new
        {
            content = content,
            title = "Test Note - Whitespace Only"
        };

        var json = JsonConvert.SerializeObject(request);
        var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

        // Act
        var response = await _client.PostAsync("/api/ingest/text", httpContent);
        
        // Assert
        response.EnsureSuccessStatusCode();
        var responseContent = await response.Content.ReadAsStringAsync();
        _output.WriteLine($"Response: {responseContent}");
        
        var result = JsonConvert.DeserializeObject<dynamic>(responseContent);
        int actualChunks = result.countChunks;
        
        // Whitespace-only content should produce 0 chunks
        Assert.Equal(0, actualChunks);
    }
}
