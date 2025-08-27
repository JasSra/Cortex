using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Text;
using Xunit;

namespace Cortex.E2E;

public class BackendFixture : IAsyncLifetime
{
    private Process? _proc;
    private bool _startedHere = false;
    public string BaseUrl { get; } = "http://localhost:8080";
    private readonly StringBuilder _stdout = new();
    private readonly StringBuilder _stderr = new();

    public async Task InitializeAsync()
    {
        if (await IsHealthy()) return; // already running

    var repoRoot = FindRepoRoot(Directory.GetCurrentDirectory());
    var backendProj = Path.Combine(repoRoot, "backend", "CortexApi.csproj");
    var backendDir = Path.GetDirectoryName(backendProj)!;

        // Try to stop any previously running CortexApi instances that may lock the exe
        TryKillExistingBackend();

        // Build once to ensure binaries exist
        var buildExit = RunProcess("dotnet", $"build \"{backendProj}\" -c Debug", backendDir, out var buildStdout, out var buildStderr);
        if (buildExit != 0)
        {
            throw new Exception($"Backend build failed with code {buildExit}.\nSTDOUT:\n{buildStdout}\nSTDERR:\n{buildStderr}");
        }

        var psi = new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments = $"run --project \"{backendProj}\" --no-build",
            WorkingDirectory = backendDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        _proc = Process.Start(psi);
        if (_proc == null)
            throw new Exception("Failed to start backend process");

        _proc.OutputDataReceived += (_, e) => { if (e.Data != null) _stdout.AppendLine(e.Data); };
        _proc.ErrorDataReceived += (_, e) => { if (e.Data != null) _stderr.AppendLine(e.Data); };
        _proc.BeginOutputReadLine();
        _proc.BeginErrorReadLine();
        _startedHere = true;

        // wait for health
        var start = DateTime.UtcNow;
        Exception? last = null;
        while (DateTime.UtcNow - start < TimeSpan.FromSeconds(120))
        {
            try
            {
                if (await IsHealthy()) return;
            }
            catch (Exception ex)
            {
                last = ex;
            }
            if (_proc.HasExited)
            {
                var msg = $"Backend process exited early with code {_proc.ExitCode}.\nSTDOUT:\n{_stdout}\nSTDERR:\n{_stderr}";
                throw new Exception(msg);
            }
            await Task.Delay(500);
        }

        var outTail = Tail(_stdout, 200);
        var errTail = Tail(_stderr, 200);
        throw new TimeoutException($"Backend did not become healthy. Last error: {last?.Message}\nSTDOUT (tail):\n{outTail}\nSTDERR (tail):\n{errTail}");
    }

    public Task DisposeAsync()
    {
        if (_startedHere && _proc is { HasExited: false })
        {
            try { _proc.Kill(true); } catch { }
        }
        return Task.CompletedTask;
    }

    private async Task<bool> IsHealthy()
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        try
        {
            var json = await http.GetStringAsync($"{BaseUrl}/health");
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("status", out var s) && s.GetString() == "healthy";
        }
        catch
        {
            return false;
        }
    }

    private static string FindRepoRoot(string start)
    {
        var dir = new DirectoryInfo(start);
        while (dir != null)
        {
            var sln = Path.Combine(dir.FullName, "Cortex.sln");
            var backendProj = Path.Combine(dir.FullName, "backend", "CortexApi.csproj");
            if (File.Exists(sln) && File.Exists(backendProj))
                return dir.FullName;
            dir = dir.Parent;
        }
        // Fallback to current directory if not found
        return start;
    }

    private static string Tail(StringBuilder sb, int maxLines)
    {
        var text = sb.ToString();
        var lines = text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
        if (lines.Length <= maxLines) return text;
        return string.Join(Environment.NewLine, lines[^maxLines..]);
    }

    private static void TryKillExistingBackend()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("CortexApi"))
            {
                try { p.Kill(true); p.WaitForExit(5000); } catch { }
            }
        }
        catch { }
    }

    private static int RunProcess(string fileName, string arguments, string workingDir, out string stdout, out string stderr)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDir,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        using var p = Process.Start(psi)!;
        var so = new StringBuilder();
        var se = new StringBuilder();
        p.OutputDataReceived += (_, e) => { if (e.Data != null) so.AppendLine(e.Data); };
        p.ErrorDataReceived += (_, e) => { if (e.Data != null) se.AppendLine(e.Data); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        p.WaitForExit(120000);
        stdout = so.ToString();
        stderr = se.ToString();
        return p.ExitCode;
    }
}