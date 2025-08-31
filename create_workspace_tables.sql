-- Create UserWorkspaces table
CREATE TABLE UserWorkspaces (
    Id TEXT NOT NULL PRIMARY KEY,
    UserId TEXT NOT NULL,
    ActiveNoteId TEXT NULL,
    RecentNoteIds TEXT NULL,
    EditorState TEXT NULL,
    PinnedTags TEXT NULL,
    LayoutPreferences TEXT NULL,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES UserProfiles(Id),
    FOREIGN KEY (ActiveNoteId) REFERENCES Notes(Id)
);

-- Create unique index on UserId
CREATE UNIQUE INDEX IX_UserWorkspaces_UserId ON UserWorkspaces (UserId);
CREATE INDEX IX_UserWorkspaces_ActiveNoteId ON UserWorkspaces (ActiveNoteId);

-- Create UserNoteAccess table
CREATE TABLE UserNoteAccess (
    Id TEXT NOT NULL PRIMARY KEY,
    UserId TEXT NOT NULL,
    NoteId TEXT NOT NULL,
    AccessType TEXT NOT NULL,
    DurationSeconds INTEGER NOT NULL,
    EditorStateSnapshot TEXT NULL,
    AccessedAt TEXT NOT NULL,
    FOREIGN KEY (UserId) REFERENCES UserProfiles(Id),
    FOREIGN KEY (NoteId) REFERENCES Notes(Id)
);

-- Create indexes for UserNoteAccess
CREATE INDEX IX_UserNoteAccess_UserId ON UserNoteAccess (UserId);
CREATE INDEX IX_UserNoteAccess_NoteId ON UserNoteAccess (NoteId);
CREATE INDEX IX_UserNoteAccess_AccessedAt ON UserNoteAccess (AccessedAt);
