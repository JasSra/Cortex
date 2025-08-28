using Microsoft.EntityFrameworkCore;
using CortexApi.Models;
using CortexApi.Security;

namespace CortexApi.Data;

public class CortexDbContext : DbContext
{
    private readonly IUserContextAccessor? _user;
    public string CurrentUserId => _user?.UserId ?? "default";

    public CortexDbContext(DbContextOptions<CortexDbContext> options, IUserContextAccessor? user = null) : base(options)
    {
        _user = user; // may be null during design-time tooling
    }

    public DbSet<Note> Notes { get; set; }
    public DbSet<NoteChunk> NoteChunks { get; set; }
    public DbSet<Embedding> Embeddings { get; set; }
    public DbSet<Tag> Tags { get; set; }
    public DbSet<NoteTag> NoteTags { get; set; }
    public DbSet<Classification> Classifications { get; set; }
    public DbSet<ActionLog> ActionLogs { get; set; }
    
    // Stage 2 DbSets
    public DbSet<Entity> Entities { get; set; }
    public DbSet<TextSpan> TextSpans { get; set; }
    public DbSet<UserFeedback> UserFeedbacks { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

    // Configure Note entity
    modelBuilder.Entity<Note>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(500);
            entity.Property(e => e.OriginalPath).IsRequired().HasMaxLength(1000);
            entity.Property(e => e.FilePath).IsRequired().HasMaxLength(1000);
            entity.Property(e => e.FileType).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Sha256Hash).IsRequired().HasMaxLength(64);
            entity.HasIndex(e => e.Sha256Hash).IsUnique();
            entity.HasIndex(e => e.CreatedAt);
            entity.HasIndex(e => e.FileType);
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => e.IsDeleted);
            // Row-level filter: user scope + soft delete
            entity.HasQueryFilter(n => !n.IsDeleted && n.UserId == CurrentUserId);
        });

        // Configure NoteChunk entity
        modelBuilder.Entity<NoteChunk>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NoteId).IsRequired();
            entity.Property(e => e.Content).IsRequired();
            entity.HasIndex(e => e.NoteId);
            entity.HasIndex(e => e.ChunkIndex);
            entity.Property(e => e.Seq).HasDefaultValue(0);
            entity.Property(e => e.Text).HasDefaultValue("");
            entity.Property(e => e.Sha256).HasMaxLength(64);
            entity.HasIndex(e => e.Sha256);
            
            entity.HasOne(e => e.Note)
                  .WithMany(n => n.Chunks)
                  .HasForeignKey(e => e.NoteId)
                  .OnDelete(DeleteBehavior.Cascade);
            // Row-level filter via parent Note
            entity.HasQueryFilter(c => !c.Note.IsDeleted && c.Note.UserId == CurrentUserId);
        });

        // Embedding entity
        modelBuilder.Entity<Embedding>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ChunkId).IsRequired();
            entity.Property(e => e.Provider).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Model).IsRequired().HasMaxLength(100);
            entity.HasIndex(e => e.ChunkId);
            entity.HasOne(e => e.Chunk)
                  .WithMany(c => c.Embeddings)
                  .HasForeignKey(e => e.ChunkId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasQueryFilter(e => !e.Chunk.Note.IsDeleted && e.Chunk.Note.UserId == CurrentUserId);
        });

        // Tags and NoteTag (many-to-many)
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.HasIndex(e => e.Name).IsUnique();
        });

        modelBuilder.Entity<NoteTag>(entity =>
        {
            entity.HasKey(e => new { e.NoteId, e.TagId });
            entity.HasOne(e => e.Note)
                  .WithMany(n => n.NoteTags)
                  .HasForeignKey(e => e.NoteId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Tag)
                  .WithMany(t => t.NoteTags)
                  .HasForeignKey(e => e.TagId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Classification
        modelBuilder.Entity<Classification>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(100);
            entity.HasIndex(e => new { e.NoteId, e.Label });
            entity.HasOne(e => e.Note)
                  .WithMany(n => n.Classifications)
                  .HasForeignKey(e => e.NoteId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Enable FTS5 for search
        modelBuilder.Entity<NoteChunk>()
            .HasIndex(e => e.Content)
            .HasDatabaseName("IX_NoteChunks_Content_FTS");

        // Stage 2 Entity Configurations
        
        // Entity
        modelBuilder.Entity<Entity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Value).IsRequired().HasMaxLength(500);
            entity.HasIndex(e => new { e.Type, e.Value });
        });

        // TextSpan  
        modelBuilder.Entity<TextSpan>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(50);
            entity.HasIndex(e => new { e.NoteId, e.Label });
            entity.HasIndex(e => new { e.Start, e.End });
            entity.HasOne(e => e.Note)
                  .WithMany(n => n.Spans)
                  .HasForeignKey(e => e.NoteId)
                  .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Entity)
                  .WithMany()
                  .HasForeignKey(e => e.EntityId)
                  .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
