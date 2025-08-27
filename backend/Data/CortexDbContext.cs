using Microsoft.EntityFrameworkCore;
using CortexApi.Models;

namespace CortexApi.Data;

public class CortexDbContext : DbContext
{
    public CortexDbContext(DbContextOptions<CortexDbContext> options) : base(options)
    {
    }

    public DbSet<Note> Notes { get; set; }
    public DbSet<NoteChunk> NoteChunks { get; set; }

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
        });

        // Configure NoteChunk entity
        modelBuilder.Entity<NoteChunk>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NoteId).IsRequired();
            entity.Property(e => e.Content).IsRequired();
            entity.HasIndex(e => e.NoteId);
            entity.HasIndex(e => e.ChunkIndex);
            
            entity.HasOne(e => e.Note)
                  .WithMany(n => n.Chunks)
                  .HasForeignKey(e => e.NoteId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Enable FTS5 for search
        modelBuilder.Entity<NoteChunk>()
            .HasIndex(e => e.Content)
            .HasDatabaseName("IX_NoteChunks_Content_FTS");
    }
}
