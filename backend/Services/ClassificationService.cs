using Microsoft.ML;
using Microsoft.ML.Data;
using Microsoft.ML.Trainers;
using CortexApi.Models;
using CortexApi.Data;
using Microsoft.EntityFrameworkCore;

namespace CortexApi.Services;

public interface IClassificationService
{
    Task<ClassificationResult> ClassifyTextAsync(string text, string? noteId = null);
    Task TrainTopicModelAsync(List<TrainingData> trainingData);
    Task TrainSensitivityModelAsync(List<SensitivityTrainingData> trainingData);
    Task<List<string>> PredictTagsAsync(string text);
    Task<double> PredictSensitivityScoreAsync(string text);
    Task AddUserFeedbackAsync(string noteId, string actualTopic, string[] actualTags, double actualSensitivity);
}

public class ClassificationService : IClassificationService
{
    private readonly ILogger<ClassificationService> _logger;
    private readonly CortexDbContext _dbContext;
    private readonly MLContext _mlContext;
    private readonly string _modelsPath;
    
    private ITransformer? _topicModel;
    private ITransformer? _sensitivityModel;
    private PredictionEngine<TopicInput, TopicPrediction>? _topicEngine;
    private PredictionEngine<SensitivityInput, SensitivityPrediction>? _sensitivityEngine;

    public ClassificationService(ILogger<ClassificationService> logger, CortexDbContext dbContext)
    {
        _logger = logger;
        _dbContext = dbContext;
        _mlContext = new MLContext(seed: 0);
        var envModels = Environment.GetEnvironmentVariable("MODELS_DIR");
        if (!string.IsNullOrWhiteSpace(envModels))
        {
            _modelsPath = Path.IsPathRooted(envModels)
                ? envModels
                : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, envModels);
        }
        else
        {
            _modelsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Models");
        }
        Directory.CreateDirectory(_modelsPath);
        
    _ = LoadModelsAsync();
    }

    public async Task<ClassificationResult> ClassifyTextAsync(string text, string? noteId = null)
    {
        var result = new ClassificationResult
        {
            NoteId = noteId ?? string.Empty,
            SensitivityLevel = 1
        };

        try
        {
            // Predict topic/tags
            if (_topicEngine != null)
            {
                var topicInput = new TopicInput { Text = text };
                var topicPrediction = _topicEngine.Predict(topicInput);

                // Convert to TagPrediction objects from model label
                var tags = ExtractTopTags(topicPrediction.Score, topicPrediction.PredictedLabel);
                var mlTags = tags.Select(tag => new TagPrediction
                {
                    Name = tag,
                    Confidence = topicPrediction.Score.Max(),
                    Suggested = true
                }).ToList();

                // Also extract keyword/phrase tags from title + content to enrich results
                var keywordTags = ExtractKeywordTags(text, 6);
                var keywordPreds = keywordTags
                    .Except(mlTags.Select(t => t.Name), StringComparer.OrdinalIgnoreCase)
                    .Select(t => new TagPrediction { Name = t, Confidence = 0.65, Suggested = true })
                    .ToList();

                result.Tags = mlTags.Concat(keywordPreds).ToList();
            }

            // Predict sensitivity score
            if (_sensitivityEngine != null)
            {
                var sensitivityInput = new SensitivityInput { Text = text };
                var sensitivityPrediction = _sensitivityEngine.Predict(sensitivityInput);
                
                result.SensitivityLevel = GetSensitivityLevelFromScore(sensitivityPrediction.Score);
            }

            _logger.LogInformation("Classified text: Tags={TagCount}, Sensitivity={Sensitivity}", 
                result.Tags.Count, result.SensitivityLevel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during text classification");
            
            // Fallback to rule-based classification
            result = await FallbackClassificationAsync(text, noteId);
        }

        return result;
    }

    public Task TrainTopicModelAsync(List<TrainingData> trainingData)
    {
        if (!trainingData.Any())
        {
            _logger.LogWarning("No training data provided for topic model");
            return Task.CompletedTask;
        }

        try
        {
            var dataView = _mlContext.Data.LoadFromEnumerable(trainingData.Select(d => new TopicInput 
            { 
                Text = d.Text, 
                Label = d.Topic 
            }));

            // Define the training pipeline
            var pipeline = _mlContext.Transforms.Conversion.MapValueToKey("Label")
                .Append(_mlContext.Transforms.Text.FeaturizeText("Features", "Text"))
                .Append(_mlContext.MulticlassClassification.Trainers.SdcaMaximumEntropy("Label", "Features"))
                .Append(_mlContext.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

            _logger.LogInformation("Training topic model with {Count} samples", trainingData.Count);
            
            _topicModel = pipeline.Fit(dataView);
            _topicEngine = _mlContext.Model.CreatePredictionEngine<TopicInput, TopicPrediction>(_topicModel);

            // Save the model
            var topicModelPath = Path.Combine(_modelsPath, "topic_model.zip");
            _mlContext.Model.Save(_topicModel, dataView.Schema, topicModelPath);
            
            _logger.LogInformation("Topic model trained and saved to {Path}", topicModelPath);
    }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error training topic model");
            throw;
        }
    return Task.CompletedTask;
    }

    public Task TrainSensitivityModelAsync(List<SensitivityTrainingData> trainingData)
    {
        if (!trainingData.Any())
        {
            _logger.LogWarning("No training data provided for sensitivity model");
        return Task.CompletedTask;
        }

        try
        {
            var dataView = _mlContext.Data.LoadFromEnumerable(trainingData.Select(d => new SensitivityInput 
            { 
                Text = d.Text, 
                Label = (float)d.SensitivityScore 
            }));

            // Define the training pipeline for regression
            var pipeline = _mlContext.Transforms.Text.FeaturizeText("Features", "Text")
                .Append(_mlContext.Regression.Trainers.Sdca(labelColumnName: "Label", featureColumnName: "Features"));

            _logger.LogInformation("Training sensitivity model with {Count} samples", trainingData.Count);
            
            _sensitivityModel = pipeline.Fit(dataView);
            _sensitivityEngine = _mlContext.Model.CreatePredictionEngine<SensitivityInput, SensitivityPrediction>(_sensitivityModel);

            // Save the model
            var sensitivityModelPath = Path.Combine(_modelsPath, "sensitivity_model.zip");
            _mlContext.Model.Save(_sensitivityModel, dataView.Schema, sensitivityModelPath);
            
            _logger.LogInformation("Sensitivity model trained and saved to {Path}", sensitivityModelPath);
    }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error training sensitivity model");
            throw;
        }
    return Task.CompletedTask;
    }

    public async Task<List<string>> PredictTagsAsync(string text)
    {
        if (_topicEngine == null)
        {
            return await FallbackTagPredictionAsync(text);
        }

        try
        {
            var input = new TopicInput { Text = text };
            var prediction = _topicEngine.Predict(input);
            
            return ExtractTopTags(prediction.Score, prediction.PredictedLabel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error predicting tags");
            return await FallbackTagPredictionAsync(text);
        }
    }

    public async Task<double> PredictSensitivityScoreAsync(string text)
    {
        if (_sensitivityEngine == null)
        {
            return await FallbackSensitivityScoreAsync(text);
        }

        try
        {
            var input = new SensitivityInput { Text = text };
            var prediction = _sensitivityEngine.Predict(input);
            
            // Ensure score is between 0 and 1
            return Math.Max(0, Math.Min(1, prediction.Score));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error predicting sensitivity score");
            return await FallbackSensitivityScoreAsync(text);
        }
    }

    public async Task AddUserFeedbackAsync(string noteId, string actualTopic, string[] actualTags, double actualSensitivity)
    {
        try
        {
            // Store feedback for future retraining
            var feedback = new UserFeedback
            {
                NoteId = noteId,
                ActualTopic = actualTopic,
                ActualTags = string.Join(",", actualTags),
                ActualSensitivity = actualSensitivity,
                CreatedAt = DateTime.UtcNow
            };

            _dbContext.UserFeedbacks.Add(feedback);
            await _dbContext.SaveChangesAsync();

            _logger.LogInformation("User feedback stored for note {NoteId}: Topic={Topic}, Sensitivity={Sensitivity}", 
                noteId, actualTopic, actualSensitivity);

            // Check if we have enough feedback to trigger retraining
            var feedbackCount = await _dbContext.UserFeedbacks.CountAsync();
            if (feedbackCount % 100 == 0) // Retrain every 100 feedback entries
            {
                _ = Task.Run(async () => await RetrainModelsFromFeedbackAsync());
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error storing user feedback");
        }
    }

    private Task LoadModelsAsync()
    {
        try
        {
            var topicModelPath = Path.Combine(_modelsPath, "topic_model.zip");
            var sensitivityModelPath = Path.Combine(_modelsPath, "sensitivity_model.zip");

            if (File.Exists(topicModelPath))
            {
                _topicModel = _mlContext.Model.Load(topicModelPath, out var topicSchema);
                _topicEngine = _mlContext.Model.CreatePredictionEngine<TopicInput, TopicPrediction>(_topicModel);
                _logger.LogInformation("Topic model loaded from {Path}", topicModelPath);
            }

            if (File.Exists(sensitivityModelPath))
            {
                _sensitivityModel = _mlContext.Model.Load(sensitivityModelPath, out var sensitivitySchema);
                _sensitivityEngine = _mlContext.Model.CreatePredictionEngine<SensitivityInput, SensitivityPrediction>(_sensitivityModel);
                _logger.LogInformation("Sensitivity model loaded from {Path}", sensitivityModelPath);
            }

            if (_topicModel == null || _sensitivityModel == null)
            {
                _logger.LogInformation("Some models not found, will use fallback classification");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading ML models");
        }
    return Task.CompletedTask;
    }

    private List<string> ExtractTopTags(float[] scores, string predictedLabel)
    {
        var tags = new List<string> { predictedLabel };
        
        // Add additional tags based on score threshold
        // This is a simplified approach - in practice, you'd have a tag vocabulary
        if (scores.Any(s => s > 0.7f))
        {
            tags.Add("high-confidence");
        }
        
        return tags.Distinct().ToList();
    }

    private string GetSensitivityLevel(float score)
    {
        return score switch
        {
            >= 0.8f => "high",
            >= 0.6f => "medium",
            >= 0.4f => "low",
            _ => "public"
        };
    }

    private int GetSensitivityLevelFromScore(float score)
    {
        return score switch
        {
            >= 0.8f => 4, // high
            >= 0.6f => 3, // medium  
            >= 0.4f => 2, // low
            _ => 1 // public
        };
    }

    private async Task<ClassificationResult> FallbackClassificationAsync(string text, string? noteId)
    {
        // Rule-based fallback classification
        var result = new ClassificationResult
        {
            NoteId = noteId ?? string.Empty,
            Tags = new List<TagPrediction> { new TagPrediction { Name = "unclassified", Confidence = 0.5 } },
            SensitivityLevel = 2, // low
            PiiFlags = new List<PiiDetection>(),
            SecretFlags = new List<SecretDetection>(),
            Summary = string.Empty
        };

        // Simple keyword-based classification
        var lowerText = text.ToLowerInvariant();
        
        if (lowerText.Contains("confidential") || lowerText.Contains("secret") || lowerText.Contains("private"))
        {
            result.SensitivityLevel = 4; // high
            result.Tags = new List<TagPrediction> { new TagPrediction { Name = "confidential", Confidence = 0.8 } };
        }
        else if (lowerText.Contains("internal") || lowerText.Contains("restricted"))
        {
            result.SensitivityLevel = 3; // medium
            result.Tags = new List<TagPrediction> { new TagPrediction { Name = "internal", Confidence = 0.6 } };
        }

        // Topic classification based on keywords
        var additionalTags = new List<TagPrediction>();
        if (lowerText.Contains("meeting") || lowerText.Contains("agenda"))
        {
            additionalTags.Add(new TagPrediction { Name = "meetings", Confidence = 0.7 });
        }
        else if (lowerText.Contains("project") || lowerText.Contains("task"))
        {
            additionalTags.Add(new TagPrediction { Name = "projects", Confidence = 0.7 });
        }
        else if (lowerText.Contains("research") || lowerText.Contains("analysis"))
        {
            additionalTags.Add(new TagPrediction { Name = "research", Confidence = 0.7 });
        }

        // Keyword/phrase tags extracted from the text/title
        var keywordTags = ExtractKeywordTags(text, 6)
            .Except(result.Tags.Select(t => t.Name), StringComparer.OrdinalIgnoreCase)
            .Select(t => new TagPrediction { Name = t, Confidence = 0.65 })
            .ToList();

        if (additionalTags.Any() || keywordTags.Any())
        {
            result.Tags.AddRange(additionalTags);
            result.Tags.AddRange(keywordTags);
        }

        return await Task.FromResult(result);
    }

    private async Task<List<string>> FallbackTagPredictionAsync(string text)
    {
        var tags = ExtractKeywordTags(text, 6);
        if (tags.Count == 0) tags = new List<string> { "general" };
        return await Task.FromResult(tags);
    }

    // Heuristic keyword/phrase tag extraction from title + content
    private List<string> ExtractKeywordTags(string text, int max = 6)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();

        // Normalize whitespace
        var normalized = text.Replace('\r', ' ').Replace('\n', ' ').Trim();

        // Prefer the first line (often the title) for phrase extraction
        var firstSentence = normalized.Split('.', '!', '?').FirstOrDefault() ?? normalized;

        // Basic stopwords
        var stop = new HashSet<string>(new[]{
            "the","a","an","and","or","but","for","nor","on","in","at","to","from","by",
            "of","is","are","was","were","be","been","being","with","as","that","this","it",
            "impossibly","very","really","just","about","over","under","more","most","less","least"
        }, StringComparer.OrdinalIgnoreCase);

        // Known tech terms to prioritize
        var techHints = new[] {
            "python","javascript","typescript","web","framework","microframework","microservice","api",
            "web framework","cli","database","sql","sqlite","postgres","docker","kubernetes","ai","ml",
            "hacker news","hn","open source","performance","benchmark"
        };

        // Collect candidates: n-grams from the title/first sentence and capitalized tokens
        var tokens = firstSentence
            .Split(new[]{' ', '\t', '\u00A0', '"', '\'', '(', ')', '[', ']', '{', '}', ',', ';', ':', '/', '|', '\\'}, StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim('—','–','-','–','—','.',',',';','!','?'))
            .Where(t => t.Length >= 2 && t.Length <= 32)
            .ToList();

        var candidates = new List<string>();

        // Capitalized tokens (likely proper nouns/technologies)
        foreach (var t in tokens)
        {
            if (!stop.Contains(t) && char.IsLetter(t[0]) && char.IsUpper(t[0]))
            {
                candidates.Add(t);
            }
        }

        // 2-gram and 3-gram phrases from the first sentence
        for (int n = 2; n <= 3; n++)
        {
            for (int i = 0; i + n <= tokens.Count; i++)
            {
                var phrase = string.Join(" ", tokens.Skip(i).Take(n));
                var words = phrase.Split(' ');
                if (words.Any(w => stop.Contains(w))) continue;
                if (words.All(w => w.Length <= 1)) continue;
                // keep phrases with alpha content
                if (words.Any(w => w.Any(char.IsLetter)))
                    candidates.Add(phrase);
            }
        }

        // Add tech hints present in text
        var lower = normalized.ToLowerInvariant();
        foreach (var hint in techHints)
        {
            if (lower.Contains(hint)) candidates.Add(hint);
        }

        // Score candidates by frequency in full text (favor phrases and unique tokens)
        var scores = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var c in candidates)
        {
            if (stop.Contains(c)) continue;
            var lc = c.ToLowerInvariant();
            var count = 0;
            var idx = 0;
            while ((idx = lower.IndexOf(lc, idx, StringComparison.Ordinal)) >= 0)
            {
                count++; idx += lc.Length;
            }
            if (count > 0) scores[c] = (scores.TryGetValue(c, out var prev) ? prev : 0) + count + (c.Contains(' ') ? 1 : 0);
        }

        var ordered = scores
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => kv.Key.Length)
            .Select(kv => kv.Key)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(t => t.Length >= 2 && t.Length <= 40)
            .Take(max)
            .ToList();

        // Normalize casing: lower-case multiword technical phrases, keep proper nouns
        var normalizedTags = ordered.Select(tag =>
        {
            if (tag.Any(char.IsWhiteSpace)) return tag.ToLowerInvariant();
            // Keep capitalization if looks like proper noun/acronym
            return (tag.All(char.IsUpper) || char.IsUpper(tag[0])) ? tag : tag.ToLowerInvariant();
        })
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

        return normalizedTags;
    }

    private async Task<double> FallbackSensitivityScoreAsync(string text)
    {
        var lowerText = text.ToLowerInvariant();
        double score = 0.2; // Default public score

        // Increase score based on sensitive keywords
        if (lowerText.Contains("confidential") || lowerText.Contains("secret")) score += 0.6;
        if (lowerText.Contains("private") || lowerText.Contains("personal")) score += 0.4;
        if (lowerText.Contains("internal") || lowerText.Contains("restricted")) score += 0.3;
        if (lowerText.Contains("password") || lowerText.Contains("key")) score += 0.4;

        return await Task.FromResult(Math.Min(1.0, score));
    }

    private async Task RetrainModelsFromFeedbackAsync()
    {
        try
        {
            _logger.LogInformation("Starting model retraining from user feedback");

            // Get all feedback and recent notes for training
            var feedbacks = await _dbContext.UserFeedbacks.ToListAsync();
            var notes = await _dbContext.Notes.Take(1000).ToListAsync(); // Limit for performance

            // Prepare topic training data
            var topicTrainingData = feedbacks.Select(f => new TrainingData
            {
                Text = notes.FirstOrDefault(n => n.Id == f.NoteId)?.Content ?? "",
                Topic = f.ActualTopic
            }).Where(t => !string.IsNullOrEmpty(t.Text)).ToList();

            // Prepare sensitivity training data
            var sensitivityTrainingData = feedbacks.Select(f => new SensitivityTrainingData
            {
                Text = notes.FirstOrDefault(n => n.Id == f.NoteId)?.Content ?? "",
                SensitivityScore = f.ActualSensitivity
            }).Where(t => !string.IsNullOrEmpty(t.Text)).ToList();

            if (topicTrainingData.Any())
            {
                await TrainTopicModelAsync(topicTrainingData);
            }

            if (sensitivityTrainingData.Any())
            {
                await TrainSensitivityModelAsync(sensitivityTrainingData);
            }

            _logger.LogInformation("Model retraining completed");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during model retraining");
        }
    }
}

// ML.NET input/output classes
public class TopicInput
{
    public string Text { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}

public class TopicPrediction
{
    [ColumnName("PredictedLabel")]
    public string PredictedLabel { get; set; } = string.Empty;
    
    [ColumnName("Score")]
    public float[] Score { get; set; } = Array.Empty<float>();
}

public class SensitivityInput
{
    public string Text { get; set; } = string.Empty;
    public float Label { get; set; }
}

public class SensitivityPrediction
{
    [ColumnName("Score")]
    public float Score { get; set; }
}

// Training data classes
public class TrainingData
{
    public string Text { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
}

public class SensitivityTrainingData
{
    public string Text { get; set; } = string.Empty;
    public double SensitivityScore { get; set; }
}
