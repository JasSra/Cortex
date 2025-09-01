using CortexApi.Data;
using CortexApi.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace CortexApi.Services;

public interface ISeedDataService
{
    Task SeedDataForNewUserAsync(string userId);
    Task<bool> HasUserDataAsync(string userId);
}

public class SeedDataService : ISeedDataService
{
    private readonly CortexDbContext _context;
    private readonly ILogger<SeedDataService> _logger;
    private readonly IVectorService _vectorService;

    public SeedDataService(CortexDbContext context, ILogger<SeedDataService> logger, IVectorService vectorService)
    {
        _context = context;
        _logger = logger;
        _vectorService = vectorService;
    }

    public async Task<bool> HasUserDataAsync(string userId)
    {
        return await _context.Notes.AnyAsync(n => n.UserId == userId);
    }

    public async Task SeedDataForNewUserAsync(string userId)
    {
        // if (await HasUserDataAsync(userId))
        // {
        //     _logger.LogInformation("User {UserId} already has data, skipping seed", userId);
        //     return;
        // }

        _logger.LogInformation("Seeding data for new user {UserId}", userId);

        var shakespeareNotes = CreateShakespeareNotes(userId);
        var scienceNotes = CreateScienceNotes(userId);

        var allNotes = shakespeareNotes.Concat(scienceNotes).ToList();

        // For each note, create a single chunk from full content and enqueue embedding
        var now = DateTime.UtcNow;
        var allChunks = new List<NoteChunk>();
        foreach (var note in allNotes)
        {
            if (!string.IsNullOrWhiteSpace(note.Content))
            {
                var text = note.Content.Trim();
                var chunk = new NoteChunk
                {
                    NoteId = note.Id,
                    Content = text,
                    Text = text,
                    ChunkIndex = 0,
                    Seq = 0,
                    TokenCount = Math.Max(1, text.Length / 4),
                    CreatedAt = now
                };
                note.ChunkCount = 1;
                allChunks.Add(chunk);
            }
        }

        await _context.Notes.AddRangeAsync(allNotes);
        if (allChunks.Count > 0)
        {
            await _context.NoteChunks.AddRangeAsync(allChunks);
        }
        await _context.SaveChangesAsync();

        // Enqueue embeddings after IDs are persisted
        foreach (var chunk in allChunks)
        {
            var note = allNotes.First(n => n.Id == chunk.NoteId);
            await _vectorService.EnqueueEmbedAsync(note, chunk);
        }

        _logger.LogInformation("Successfully seeded {Count} notes for user {UserId}", allNotes.Count, userId);
    }

    private static string ComputeSha256(string input)
    {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        var sb = new StringBuilder(bytes.Length * 2);
        foreach (var b in bytes) sb.AppendFormat("{0:x2}", b);
        return sb.ToString();
    }

    private List<Note> CreateShakespeareNotes(string userId)
    {
        var shakespeareData = new[]
        {
            ("Hamlet's Soliloquy", "To be or not to be, that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune, or to take arms against a sea of troubles and by opposing end them. This famous soliloquy from Hamlet explores the nature of existence and the contemplation of suicide.", new[] { "shakespeare", "hamlet", "soliloquy", "philosophy" }),
            ("Romeo and Juliet's Balcony Scene", "But soft, what light through yonder window breaks? It is the east, and Juliet is the sun. The balcony scene represents the pinnacle of romantic expression in literature, showcasing Shakespeare's mastery of poetic language and dramatic tension.", new[] { "shakespeare", "romeo-juliet", "romance", "poetry" }),
            ("Macbeth's Ambition", "Is this a dagger which I see before me, the handle toward my hand? Macbeth's hallucination of the dagger symbolizes his internal conflict and the corruption of ambition. The play explores themes of power, guilt, and moral decay.", new[] { "shakespeare", "macbeth", "ambition", "guilt" }),
            ("King Lear's Storm", "Blow, winds, and crack your cheeks! Rage, blow! The storm in King Lear serves as both external conflict and internal metaphor for the chaos in Lear's mind and kingdom. Nature becomes a character in the play.", new[] { "shakespeare", "king-lear", "nature", "chaos" }),
            ("Othello's Jealousy", "O, beware, my lord, of jealousy! It is the green-eyed monster which doth mock the meat it feeds on. Iago's manipulation of Othello demonstrates how jealousy can destroy even the noblest of characters.", new[] { "shakespeare", "othello", "jealousy", "manipulation" }),
            ("Shakespeare's Sonnets", "Shall I compare thee to a summer's day? Thou art more lovely and more temperate. Shakespeare's 154 sonnets explore themes of love, beauty, mortality, and time, showcasing his mastery of the sonnet form.", new[] { "shakespeare", "sonnets", "love", "poetry" }),
            ("The Tempest's Magic", "We are such stuff as dreams are made on, and our little life is rounded with a sleep. Prospero's magic in The Tempest represents art, power, and ultimately forgiveness in Shakespeare's final complete play.", new[] { "shakespeare", "tempest", "magic", "forgiveness" }),
            ("Much Ado About Nothing", "Benedick and Beatrice's witty exchanges showcase Shakespeare's comedic genius. Their 'merry war' of words eventually gives way to love, demonstrating how wit and intelligence can mask deeper emotions.", new[] { "shakespeare", "comedy", "wit", "love" }),
            ("A Midsummer Night's Dream", "Lord, what fools these mortals be! Puck's observation captures the absurdity of human behavior when love and magic intertwine in the enchanted forest outside Athens.", new[] { "shakespeare", "comedy", "magic", "love" }),
            ("Julius Caesar's Politics", "Friends, Romans, countrymen, lend me your ears! Mark Antony's funeral speech demonstrates Shakespeare's understanding of political rhetoric and the power of persuasion in swaying public opinion.", new[] { "shakespeare", "julius-caesar", "politics", "rhetoric" }),
            ("Richard III's Villainy", "Now is the winter of our discontent made glorious summer by this son of York. Richard III's opening monologue establishes him as one of literature's most compelling villains.", new[] { "shakespeare", "richard-iii", "villainy", "politics" }),
            ("As You Like It's Forest", "All the world's a stage, and all the men and women merely players. Jaques' famous speech on the seven ages of man reflects on the theatrical nature of life itself.", new[] { "shakespeare", "as-you-like-it", "philosophy", "life" }),
            ("Twelfth Night's Gender", "Some are born great, some achieve greatness, and some have greatness thrust upon them. Viola's disguise as Cesario explores themes of gender, identity, and love in this sophisticated comedy.", new[] { "shakespeare", "twelfth-night", "gender", "identity" }),
            ("The Merchant of Venice", "The quality of mercy is not strained. It droppeth as the gentle rain from heaven. Portia's speech on mercy represents one of Shakespeare's most eloquent pleas for compassion and justice.", new[] { "shakespeare", "merchant-venice", "mercy", "justice" }),
            ("Henry V's Leadership", "Once more unto the breach, dear friends, once more! Henry's speech before Harfleur demonstrates Shakespeare's ability to capture the essence of inspirational leadership and patriotism.", new[] { "shakespeare", "henry-v", "leadership", "war" }),
            ("Love's Labour's Lost", "When daisies pied and violets blue do paint the meadows with delight. This lesser-known comedy showcases Shakespeare's early experimentation with wit, wordplay, and the pursuit of knowledge versus love.", new[] { "shakespeare", "loves-labours-lost", "wit", "knowledge" }),
            ("Antony and Cleopatra", "Age cannot wither her, nor custom stale her infinite variety. The epic romance between the Roman general and Egyptian queen explores the conflict between duty and passion.", new[] { "shakespeare", "antony-cleopatra", "romance", "duty" }),
            ("Coriolanus's Pride", "What is the city but the people? Coriolanus's contempt for the common people reflects Shakespeare's exploration of class conflict and political upheaval in ancient Rome.", new[] { "shakespeare", "coriolanus", "pride", "politics" }),
            ("Timon of Athens", "I am Misanthropos, and hate mankind. Timon's transformation from generous philanthropist to bitter misanthrope explores the extremes of human nature and the corruption of wealth.", new[] { "shakespeare", "timon-athens", "misanthropy", "wealth" }),
            ("All's Well That Ends Well", "All's well that ends well; still the fine's the crown. Helena's pursuit of Bertram in this problem play examines themes of unrequited love, class differences, and determination.", new[] { "shakespeare", "alls-well", "love", "determination" })
        };

        return shakespeareData.Select((data, index) =>
        {
            var filePath = $"shakespeare_{index + 1}.txt";
            var content = data.Item2;
            var sha = ComputeSha256($"{data.Item1}|{filePath}|{content}");
            return new Note
            {
                Id = Guid.NewGuid().ToString(),
                UserId = userId,
                Title = data.Item1,
                Content = content,
                FileType = "text",
                FilePath = filePath,
                OriginalPath = filePath,
                Sha256Hash = sha,
                CreatedAt = DateTime.UtcNow.AddDays(-Random.Shared.Next(1, 30)),
                UpdatedAt = DateTime.UtcNow.AddDays(-Random.Shared.Next(1, 30)),
                IsDeleted = false,
                Tags = string.Join(",", data.Item3)
            };
        }).ToList();
    }

    private List<Note> CreateScienceNotes(string userId)
    {
        var scienceData = new[]
        {
            ("Quantum Mechanics Fundamentals", "Quantum mechanics describes the behavior of matter and energy at the atomic and subatomic level. Key principles include wave-particle duality, superposition, and quantum entanglement, which challenge our classical understanding of reality.", new[] { "physics", "quantum", "mechanics", "science" }),
            ("DNA Structure and Function", "DNA (deoxyribonucleic acid) is the hereditary material in all known living organisms. Its double helix structure, discovered by Watson and Crick, contains the genetic instructions for life through sequences of nucleotides.", new[] { "biology", "dna", "genetics", "science" }),
            ("Climate Change Science", "Global climate change is driven by increased greenhouse gas concentrations in the atmosphere. Evidence includes rising global temperatures, melting ice caps, and changing precipitation patterns affecting ecosystems worldwide.", new[] { "climate", "environment", "science", "earth" }),
            ("Artificial Intelligence Evolution", "AI has evolved from simple rule-based systems to complex neural networks capable of learning and adaptation. Machine learning algorithms now power everything from search engines to autonomous vehicles.", new[] { "ai", "technology", "machine-learning", "computer-science" }),
            ("The Theory of Relativity", "Einstein's theories of special and general relativity revolutionized our understanding of space, time, and gravity. They predict phenomena like time dilation, length contraction, and the bending of spacetime.", new[] { "physics", "einstein", "relativity", "science" }),
            ("Cellular Biology Basics", "Cells are the fundamental units of life, containing organelles that perform specific functions. Mitochondria generate energy, ribosomes synthesize proteins, and the nucleus controls cellular activities.", new[] { "biology", "cells", "organelles", "science" }),
            ("Renewable Energy Technologies", "Solar, wind, and hydroelectric power represent sustainable alternatives to fossil fuels. These technologies harness natural energy sources to generate electricity with minimal environmental impact.", new[] { "energy", "renewable", "environment", "technology" }),
            ("Chemical Bonding Principles", "Chemical bonds form when atoms share or transfer electrons to achieve stable electron configurations. Ionic, covalent, and metallic bonds determine the properties of compounds and materials.", new[] { "chemistry", "bonding", "atoms", "science" }),
            ("Evolutionary Biology", "Evolution through natural selection explains the diversity of life on Earth. Mutations, genetic drift, and environmental pressures drive changes in species over time, leading to adaptation and speciation.", new[] { "biology", "evolution", "natural-selection", "science" }),
            ("Space Exploration History", "Human space exploration began with Sputnik in 1957 and continues today with missions to Mars and beyond. Space technology has advanced from simple satellites to complex spacecraft exploring the solar system.", new[] { "space", "exploration", "technology", "astronomy" }),
            ("Neuroscience and the Brain", "The human brain contains approximately 86 billion neurons connected by trillions of synapses. Understanding neural networks helps explain consciousness, memory, learning, and neurological disorders.", new[] { "neuroscience", "brain", "neurons", "science" }),
            ("Genetic Engineering Applications", "CRISPR and other gene-editing technologies allow precise modification of DNA sequences. Applications include treating genetic diseases, improving crop yields, and developing new therapeutic approaches.", new[] { "genetics", "crispr", "biotechnology", "science" }),
            ("Thermodynamics Laws", "The laws of thermodynamics govern energy transfer and conversion in physical systems. They explain why perpetual motion machines are impossible and predict the direction of natural processes.", new[] { "physics", "thermodynamics", "energy", "science" }),
            ("Ocean Currents and Climate", "Ocean currents transport heat around the globe, influencing regional climates and weather patterns. The thermohaline circulation acts as a global conveyor belt redistributing thermal energy.", new[] { "oceanography", "climate", "currents", "earth-science" }),
            ("Microbiome Research", "The human microbiome consists of trillions of microorganisms living in and on our bodies. These microbes influence digestion, immunity, and even mental health through the gut-brain axis.", new[] { "microbiology", "microbiome", "health", "science" }),
            ("Crystallography and Materials", "X-ray crystallography reveals the atomic structure of crystals and molecules. This technique has been crucial for understanding protein structures, drug design, and developing new materials.", new[] { "chemistry", "crystallography", "materials", "science" }),
            ("Plate Tectonics Theory", "The Earth's crust consists of moving plates that interact at boundaries, causing earthquakes, volcanic activity, and mountain formation. This theory explains continental drift and seafloor spreading.", new[] { "geology", "plate-tectonics", "earth-science", "science" }),
            ("Immunology and Vaccines", "The immune system protects against pathogens through innate and adaptive responses. Vaccines train the immune system to recognize and fight specific diseases without causing illness.", new[] { "immunology", "vaccines", "medicine", "science" }),
            ("Particle Physics Standard Model", "The Standard Model describes fundamental particles and forces in the universe. It includes quarks, leptons, gauge bosons, and the Higgs boson, which gives other particles mass.", new[] { "physics", "particles", "standard-model", "science" }),
            ("Photosynthesis Process", "Photosynthesis converts sunlight, carbon dioxide, and water into glucose and oxygen. This process, carried out by plants and some bacteria, forms the foundation of most food chains on Earth.", new[] { "biology", "photosynthesis", "plants", "science" })
        };

        return scienceData.Select((data, index) =>
        {
            var filePath = $"science_{index + 1}.txt";
            var content = data.Item2;
            var sha = ComputeSha256($"{data.Item1}|{filePath}|{content}");
            return new Note
            {
                Id = Guid.NewGuid().ToString(),
                UserId = userId,
                Title = data.Item1,
                Content = content,
                FileType = "text",
                FilePath = filePath,
                OriginalPath = filePath,
                Sha256Hash = sha,
                CreatedAt = DateTime.UtcNow.AddDays(-Random.Shared.Next(1, 30)),
                UpdatedAt = DateTime.UtcNow.AddDays(-Random.Shared.Next(1, 30)),
                IsDeleted = false,
                Tags = string.Join(",", data.Item3)
            };
        }).ToList();
    }
}
