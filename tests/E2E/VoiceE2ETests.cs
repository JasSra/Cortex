using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using System.Reactive.Linq;
using Websocket.Client;
using System.Net.WebSockets;
using Xunit;

namespace Cortex.E2E;

public class VoiceE2ETests : IClassFixture<BackendFixture>
{
    private readonly string BaseUrl;
    public VoiceE2ETests(BackendFixture fx)
    {
        BaseUrl = Environment.GetEnvironmentVariable("CORTEX_API_URL") ?? fx.BaseUrl;
    }

    [Fact]
    public async Task TTS_Should_ReturnAudio()
    {
        using var http = new HttpClient();
        var resp = await http.PostAsJsonAsync($"{BaseUrl}/voice/tts", new { text = "Hello from E2E" });
        resp.IsSuccessStatusCode.Should().BeTrue();
        var bytes = await resp.Content.ReadAsByteArrayAsync();
        bytes.Should().NotBeNull();
        bytes.Length.Should().BeGreaterThan(1000); // expect >1KB wav
        var mediaType = resp.Content.Headers.ContentType?.MediaType;
        new[] { "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mpeg3" }
            .Should().Contain(mediaType);

        //save the file
        await File.WriteAllBytesAsync("e2e-tts-output.wav", bytes);
    }

    [Fact]
    public async Task STT_Should_Transcribe_Text()
    {
        // Generate a tiny WAV buffer: 1k of RIFF header + silence. This is not a real voice sample but enough to pass content-type.
        byte[] wav = CreateSilentWav(durationMs: 500);
        var uri = new Uri($"{BaseUrl.Replace("http://","ws://").Replace("https://","wss://")}/voice/stt");

        using var exit = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        string? transcription = null;

        using var client = new WebsocketClient(uri);
        client.ReconnectTimeout = TimeSpan.FromSeconds(5);
        client.MessageReceived.Subscribe(msg =>
        {
            if (msg.MessageType == WebSocketMessageType.Text && !string.IsNullOrEmpty(msg.Text))
            {
                try
                {
                    using var doc = JsonDocument.Parse(msg.Text);
                    if (doc.RootElement.TryGetProperty("text", out var t))
                    {
                        transcription = t.GetString();
                    }
                }
                catch { }
            }
        });

        await client.Start();
    await client.SendInstant(wav); // binary audio
    await client.SendInstant("END"); // control message to trigger transcription (text)

        // wait until we get a transcription or timeout
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (transcription == null && sw.Elapsed < TimeSpan.FromSeconds(15))
        {
            await Task.Delay(250, exit.Token);
        }

    transcription.Should().NotBeNull("should get a JSON with {text} from STT");
    }

    private static byte[] CreateSilentWav(int durationMs, int sampleRate = 16000)
    {
        int bytesPerSample = 2; // 16-bit PCM
        int channels = 1;
        int samples = (int)(sampleRate * (durationMs / 1000.0));
        int dataSize = samples * bytesPerSample * channels;

        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms);

        // RIFF header
        bw.Write(Encoding.ASCII.GetBytes("RIFF"));
        bw.Write(36 + dataSize);
        bw.Write(Encoding.ASCII.GetBytes("WAVE"));

        // fmt chunk
        bw.Write(Encoding.ASCII.GetBytes("fmt "));
        bw.Write(16); // PCM chunk size
        bw.Write((short)1); // PCM format
        bw.Write((short)channels);
        bw.Write(sampleRate);
        bw.Write(sampleRate * channels * bytesPerSample);
        bw.Write((short)(channels * bytesPerSample));
        bw.Write((short)16);

        // data chunk
        bw.Write(Encoding.ASCII.GetBytes("data"));
        bw.Write(dataSize);
        bw.Write(new byte[dataSize]); // silence

        bw.Flush();
        return ms.ToArray();
    }
}
