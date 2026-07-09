using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

internal sealed record AgentRuntimeDebugBodyFile(string Ref, long Bytes);

internal static class AgentRuntimeDebugPayload
{
    private const string DebugBodyDirectoryName = "opencowork-request-debug-bodies";
    // Matches the renderer debug-store entry cap (MAX_DEBUG_STORE_ENTRIES) so every
    // retained message can still resolve its last request body through bodyRef.
    private const int MaxDebugBodyFiles = 80;
    private const long MaxDebugBodyBytes = 64L * 1024 * 1024;
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);
    private static readonly object Sync = new();
    private static readonly string TempDirectory = Path.Combine(Path.GetTempPath(), DebugBodyDirectoryName);
    private static readonly Dictionary<string, DebugBodyEntry> BodyFiles = new(StringComparer.Ordinal);
    private static readonly Queue<string> BodyFileOrder = new();
    private static long TotalBodyBytes;

    public static string? PrepareBody(string? body, JsonElement parameters)
    {
        return null;
    }

    public static AgentRuntimeDebugBodyFile? PrepareBodyFile(string? body, JsonElement parameters)
    {
        if (!JsonHelpers.GetBool(parameters, "includeFullDebugBody", false) ||
            string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        var bodyRef = Guid.NewGuid().ToString("N");
        var filePath = Path.Combine(TempDirectory, $"{bodyRef}.json");
        var bytes = Encoding.UTF8.GetByteCount(body);
        var sessionId = JsonHelpers.GetString(parameters, "sessionId");

        lock (Sync)
        {
            Directory.CreateDirectory(TempDirectory);
            File.WriteAllText(filePath, body, Utf8NoBom);
            BodyFiles[bodyRef] = new DebugBodyEntry(bodyRef, filePath, bytes, sessionId);
            BodyFileOrder.Enqueue(bodyRef);
            TotalBodyBytes += bytes;
            PruneBodyFilesLocked();
        }

        return new AgentRuntimeDebugBodyFile(bodyRef, bytes);
    }

    public static async Task<WorkerResponse> ReadBody(JsonElement parameters)
    {
        var bodyRef = JsonHelpers.GetString(parameters, "bodyRef");
        var sessionId = JsonHelpers.GetString(parameters, "sessionId");
        if (string.IsNullOrWhiteSpace(bodyRef) && string.IsNullOrWhiteSpace(sessionId))
        {
            return ToResponse(Mutation(false, null, null, "Missing debug body reference"));
        }

        var entry = ResolveEntry(bodyRef, sessionId);
        if (entry is null)
        {
            return ToResponse(Mutation(false, null, null, "Debug body is no longer available"));
        }

        // Read and serialize outside the lock: a debug body is up to 64 MB and
        // often carries inlined base64 images. Holding Sync across the read would
        // block concurrent body writes, and reading synchronously would stall the
        // single IPC read loop (this handler runs inline on it) long enough to
        // trip the renderer's request timeout. The file can be pruned between
        // resolve and read; treat that as "no longer available".
        try
        {
            var body = await File.ReadAllTextAsync(entry.Path, Encoding.UTF8).ConfigureAwait(false);
            return SuccessBody(body, entry.Bytes);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            WorkerLog.Warn($"failed to read debug body: {ex.Message}");
            return ToResponse(Mutation(false, null, null, "Debug body is no longer available"));
        }
    }

    private static DebugBodyEntry? ResolveEntry(string? bodyRef, string? sessionId)
    {
        lock (Sync)
        {
            DebugBodyEntry? entry = null;
            if (!string.IsNullOrWhiteSpace(bodyRef) &&
                BodyFiles.TryGetValue(bodyRef, out var byRef) &&
                File.Exists(byRef.Path))
            {
                entry = byRef;
            }

            // The debug panel asks for "the last request body". When the per-event
            // ref is missing or its file was pruned, serve the newest body recorded
            // for the session instead of failing.
            if (entry is null && !string.IsNullOrWhiteSpace(sessionId))
            {
                foreach (var candidateRef in BodyFileOrder.Reverse())
                {
                    if (BodyFiles.TryGetValue(candidateRef, out var candidate) &&
                        string.Equals(candidate.SessionId, sessionId, StringComparison.Ordinal) &&
                        File.Exists(candidate.Path))
                    {
                        entry = candidate;
                        break;
                    }
                }
            }

            return entry;
        }
    }

    // Writes { success, body, bodyBytes } straight to the response buffer,
    // escaping the (potentially huge) body exactly once instead of the
    // Mutation -> ToJsonString -> RawJson.Parse -> WriteTo round-trip.
    private static WorkerResponse SuccessBody(string body, long bodyBytes)
    {
        return WorkerResponse.FromWriter(writer =>
        {
            writer.WriteStartObject();
            writer.WriteBoolean("success", true);
            writer.WriteString("body", body);
            writer.WriteNumber("bodyBytes", bodyBytes);
            writer.WriteEndObject();
        });
    }

    public static void CleanupTempFiles()
    {
        lock (Sync)
        {
            BodyFiles.Clear();
            BodyFileOrder.Clear();
            TotalBodyBytes = 0;
            try
            {
                if (Directory.Exists(TempDirectory))
                {
                    Directory.Delete(TempDirectory, recursive: true);
                }
            }
            catch (Exception ex)
            {
                WorkerLog.Warn($"failed to clean debug body temp files: {ex.Message}");
            }
        }
    }

    private static void PruneBodyFilesLocked()
    {
        while (BodyFileOrder.Count > 0 &&
            (BodyFiles.Count > MaxDebugBodyFiles ||
                (TotalBodyBytes > MaxDebugBodyBytes && BodyFiles.Count > 1)))
        {
            var oldestRef = BodyFileOrder.Dequeue();
            if (!BodyFiles.Remove(oldestRef, out var entry))
            {
                continue;
            }

            TotalBodyBytes = Math.Max(0, TotalBodyBytes - entry.Bytes);
            DeleteBodyFileLocked(entry);
        }
    }

    private static void DeleteBodyFileLocked(DebugBodyEntry entry)
    {
        try
        {
            if (File.Exists(entry.Path))
            {
                File.Delete(entry.Path);
            }
        }
        catch (Exception ex)
        {
            WorkerLog.Warn($"failed to delete previous debug body file: {ex.Message}");
        }
    }

    private static JsonObject Mutation(bool success, string? body, long? bodyBytes, string? error)
    {
        var result = new JsonObject { ["success"] = success };
        if (body is not null)
        {
            result["body"] = body;
        }
        if (bodyBytes.HasValue)
        {
            result["bodyBytes"] = bodyBytes.Value;
        }
        if (!string.IsNullOrWhiteSpace(error))
        {
            result["error"] = error;
        }
        return result;
    }

    private static WorkerResponse ToResponse(JsonObject node)
    {
        return WorkerResponse.RawJson(node.ToJsonString());
    }

    private sealed record DebugBodyEntry(string Ref, string Path, long Bytes, string? SessionId);
}
