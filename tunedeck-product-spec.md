# TuneDeck — Product & Functional Specification

> Working title. Final name can be chosen from the naming section at the end.

## 1. Product Vision

A personal repertoire manager for musicians, initially focused on guitar.

The app is not a practice course, tab editor, metronome, or music discovery service.

Its main job is to answer, immediately:

- What songs do I want to play?
- What songs am I currently learning?
- What songs can I already play?
- What tuning does each song use?
- Where is the Songsterr tab?
- What is the original YouTube video?
- Which guitar covers, lessons, backing tracks, or alternate versions did I save?
- When did I last play this song?
- How often have I played it?
- Which songs are related through tags?

The product should feel like a **personal music repertoire cockpit**.

---

## 2. Core Principles

1. **Fast to add**
   - Adding a song must take seconds.
   - URLs should be enough to start.
   - Metadata enrichment happens asynchronously and must never block saving.

2. **Fast to use**
   - Important information should be visible directly from the library.
   - Opening Songsterr or a YouTube resource should take one tap.

3. **Manual control first**
   - The user decides song status, tuning, tags, and resource categories.
   - APIs enrich data but do not become required dependencies.

4. **No unnecessary practice mechanics**
   - No practice timers.
   - No progress percentages.
   - No lesson plans.
   - No gamification.

5. **Offline-friendly**
   - The repertoire should remain browsable offline.
   - Changes made offline should sync later when possible.

6. **Single-user simplicity**
   - No traditional account system is required.
   - One access code is enough.

7. **Future-ready**
   - Guitar first.
   - Data model should already support Bass and Piano.

---

# 3. Instruments

Supported values from the beginning:

- Guitar
- Bass
- Piano

Initial UI can default to Guitar.

If only one instrument is being actively used, the instrument selector can remain visually subtle.

---

# 4. Song Status

Each repertoire entry has exactly one status.

Recommended statuses:

1. `WANT_TO_PLAY`
   - Want to learn/play eventually.

2. `LEARNING`
   - Currently learning.

3. `CAN_PLAY`
   - Can already play the song comfortably.

4. `MASTERED`
   - Very confident / essentially memorized.

5. `ARCHIVED`
   - Keep the data, but remove it from normal repertoire views.

No percentage or detailed learning progress is needed.

---

# 5. Main Navigation

Recommended navigation:

- **Home**
- **Library**
- **Tags**
- **Add**
- **Settings**

On mobile/PWA:

- Bottom navigation.

On desktop:

- Sidebar or compact left navigation.

`Add` should remain highly prominent.

---

# 6. Home

The Home screen should answer "what do I have to play?" without requiring filtering.

Recommended sections:

## 6.1 Currently Learning

Songs with:

`status = LEARNING`

Show:

- artwork / thumbnail
- song title
- artist
- tuning
- tags
- last played
- play count
- quick `+1`
- Songsterr shortcut if available

---

## 6.2 Want to Play

Songs with:

`status = WANT_TO_PLAY`

Useful as the personal backlog.

Optional ordering:

- manually pinned first
- recently added
- alphabetical

---

## 6.3 Ready to Play

Songs with:

- `CAN_PLAY`
- `MASTERED`

Useful when the user simply wants to pick something and play.

---

## 6.4 Recently Played

Ordered by:

`last_played_at DESC`

---

## 6.5 Haven't Played in a While

Songs the user already knows but has not played recently.

Examples:

- `CAN_PLAY`
- `MASTERED`

Sorted by oldest `last_played_at`.

This should be informational, not gamified.

---

# 7. Library

The Library is the canonical list of repertoire entries.

Supported views:

- Card view
- Compact list view

The selected view should be remembered per device.

Each item should show at minimum:

- song title
- artist
- instrument
- status
- tuning
- tags
- primary thumbnail
- last played
- play count
- available resource icons:
  - Songsterr
  - YouTube
  - PDF
  - MIDI

Actions directly from the card/list:

- Open song
- `+1 played`
- Open Songsterr
- Change status
- Favorite / pin optional

---

# 8. Filtering

Filtering should have **two levels**.

## 8.1 Primary Filters

Always visible and extremely fast to access.

### Required

- Tuning
- Status

### Third slot

Keep the architecture prepared for one additional primary filter.

Recommended future default:

- Instrument

If only Guitar is currently being used, this filter can stay hidden.

Possible future alternatives:

- Tag
- Artist
- Recently Played

---

## 8.2 Advanced Filters

Hidden behind a filter menu / drawer.

Possible filters:

- Instrument
- Artist
- Tags
- Genre
- Difficulty
- Capo
- BPM
- Favorites
- Has Songsterr
- Has Original Video
- Has Guitar Cover
- Has Lesson
- Has Backing Track
- Has PDF
- Has MIDI
- Never played
- Recently played
- Not played recently
- Date added

Advanced filters do not need to occupy permanent screen space.

---

# 9. Tuning

Tuning is stored on the repertoire entry.

Examples:

- E Standard
- Eb Standard
- Drop D
- D Standard
- Drop C#
- Drop C
- Custom

Allow:

- predefined tunings
- custom tuning label

For Piano, tuning should simply be `null`.

For Bass, the same tuning system can be reused.

---

# 10. Tags

Tags replace the need for traditional setlists.

A song can have multiple tags.

Examples:

- Linkin Park
- Nu Metal
- Drop D Favorites
- Easy
- Heavy
- Clean
- Acoustic
- Jam
- Warmup
- 2000s
- To Record
- Felipe Likes

Tag features:

- create tag
- rename tag
- delete tag
- assign multiple tags to a song
- filter by tag
- open a tag to see all associated songs
- optional tag color
- optional tag icon

Tags should be free-form.

---

# 11. Song Detail

The song detail page is the central workspace for one song.

Recommended layout:

## Header

- artwork / thumbnail
- title
- artist
- instrument
- status
- tuning
- tags
- play count
- last played
- large `+1 Played` button

Primary actions:

- Open Songsterr
- Open Original
- Edit

---

## Resources

Show resources grouped by category.

Default resource categories:

- **Original**
- **Guitar Cover**
- **Lesson**
- **Backing Track**
- **Standard Tuning**

Each resource contains:

- URL
- type
- custom label
- title
- thumbnail
- source/provider
- channel/author when available
- duration when available
- sort order
- created date

A song can have multiple resources in the same category.

Example:

### Guitar Cover

- Cover — Channel A
- Cover — Channel B
- Live Cover — Channel C

Custom label examples:

- "Best version"
- "Full song"
- "Solo only"
- "No vocals"
- "Easy fingering"
- "Good camera angle"

Resources should support drag-and-drop ordering.

Optional:

- mark one resource as primary inside each category.

---

# 12. Songsterr

Songsterr integration should intentionally remain simple and robust.

Each repertoire entry can store:

`songsterr_url`

Behavior:

- one prominent **Open in Songsterr** button
- use the normal Songsterr HTTPS URL
- allow the operating system/browser to open the installed Songsterr app when supported
- otherwise open the Songsterr website

Do not make a Songsterr API a core dependency.

No automatic Songsterr search is required in the MVP.

Possible later enhancement:

- paste Songsterr URL and try to prefill song/artist metadata
- experimental Songsterr search integration behind a feature flag

The manual link must always remain the canonical source.

---

# 13. YouTube Resources

YouTube is the primary external media source.

When a YouTube URL is pasted:

1. Detect the YouTube URL.
2. Extract the video ID immediately.
3. Create the resource immediately.
4. Show a temporary/loading state.
5. Fetch metadata asynchronously.
6. Update the card when metadata arrives.

Metadata to fetch/cache:

- video ID
- title
- channel name
- thumbnail
- duration
- canonical URL

The user must not need to wait for enrichment before continuing.

If enrichment fails:

- preserve the URL
- allow manual title
- allow retry

---

# 14. Fast Add Flow

Adding content should be optimized heavily.

## 14.1 Option A — Add Song Manually

Tap:

`+ Add`

Initial fields:

- Song name
- Artist
- Instrument
- Status
- Tuning

Everything else is optional.

Then optionally add:

- Songsterr URL
- YouTube URLs
- Tags
- PDF
- MIDI

---

## 14.2 Option B — Paste a YouTube URL

Paste:

`https://youtube.com/...`

The app should:

1. recognize YouTube
2. fetch metadata asynchronously
3. show thumbnail/title
4. ask which resource category it is:
   - Original
   - Guitar Cover
   - Lesson
   - Backing Track
   - Standard Tuning
5. allow a custom label
6. associate with:
   - existing song
   - new song

If new song:

- prefill title when possible
- user confirms artist/song name

---

## 14.3 Option C — Paste Songsterr URL

The app detects Songsterr and allows:

- associate with existing song
- create new song

The Songsterr URL is saved immediately.

Optional metadata extraction can happen in the background.

---

## 14.4 Option D — PWA Share Target

High-value feature.

When the PWA is installed on Android:

From YouTube:

`Share → TuneDeck`

The app opens directly into the Quick Add flow with the URL already filled.

The same flow can accept shared URLs from:

- browser
- YouTube
- Songsterr website
- other apps

This can become the fastest way to populate the library.

---

# 15. Played Counter

Every repertoire entry stores:

- `play_count`
- `last_played_at`

A highly accessible `+1` action should exist:

- song detail
- library card
- home cards

When tapped:

1. increment play count
2. update `last_played_at`
3. create a play-history event
4. show temporary Undo action

Example:

`Played ✓ — Undo`

Do not ask for confirmation.

---

# 16. Play History

Maintain a lightweight history.

Each play event stores:

- song/repertoire entry
- timestamp

This enables:

- play count
- last played date
- recently played
- songs not played recently
- simple historical statistics later

No session duration is required.

---

# 17. Attachments

Supported file types:

## PDF

Examples:

- sheet music
- tabs
- chord sheets
- exported lessons

## MIDI

Especially useful for Piano later.

Metadata:

- filename
- type
- size
- uploaded date
- optional custom label

Storage:

- Neon Object Storage

Do not store raw binary files directly inside Postgres.

Postgres stores only attachment metadata and object-storage references.

---

# 18. Search

Global search is **not required for MVP**.

The main usage model is:

- browse
- filter
- tags
- direct navigation

If the library grows enough that search becomes necessary, add a lightweight client-side search later.

Possible searchable fields:

- song
- artist
- tags

No external song search is required.

---

# 19. Offline PWA

The application should behave well as an installed PWA.

Offline-capable:

- app shell
- library
- song details
- tags
- cached thumbnails when possible
- metadata already synchronized locally

Use IndexedDB for local structured cache.

Offline writes should be queued:

- status change
- tag changes
- `+1 played`
- metadata edits

When connection returns:

- sync pending operations with Neon

External resources still require connectivity:

- YouTube playback
- Songsterr
- external links

PDF/MIDI can optionally be cached locally after being opened.

---

# 20. Authentication

The product is single-user.

No OAuth.

No email/password account system.

## Flow

1. App opens.
2. User enters a private access code.
3. Server validates the code.
4. Server returns a long-lived signed session token.
5. Device persists the session.
6. Future launches log in automatically.

Do **not** store the raw access code in localStorage.

Store only the signed/opaque session token.

Possible implementation:

- access-code hash stored as server environment secret
- session token signed server-side
- token stored locally
- logout clears local session

Optional:

- separate device sessions
- revoke all sessions from Settings

---

# 21. Suggested Data Model

The model should separate the musical work from the user's instrument-specific repertoire entry.

This allows the same song to eventually exist for Guitar, Bass, and Piano independently.

---

## `songs`

Canonical song metadata.

Fields:

- `id`
- `title`
- `artist`
- `album` nullable
- `genre` nullable
- `bpm` nullable
- `created_at`
- `updated_at`

---

## `repertoire_entries`

User-specific playable version of a song.

Fields:

- `id`
- `song_id`
- `instrument`
  - guitar
  - bass
  - piano
- `status`
- `tuning` nullable
- `capo` nullable
- `difficulty` nullable
- `songsterr_url` nullable
- `play_count`
- `last_played_at` nullable
- `is_favorite`
- `created_at`
- `updated_at`

Unique suggestion:

`(song_id, instrument)`

---

## `resources`

External media/resources.

Fields:

- `id`
- `repertoire_entry_id`
- `type`
  - original
  - guitar_cover
  - lesson
  - backing_track
  - standard_tuning
  - custom
- `custom_label` nullable
- `provider`
  - youtube
  - songsterr
  - external
- `url`
- `external_id` nullable
- `title` nullable
- `author` nullable
- `thumbnail_url` nullable
- `duration_seconds` nullable
- `is_primary`
- `sort_order`
- `created_at`
- `updated_at`

---

## `tags`

Fields:

- `id`
- `name`
- `color` nullable
- `created_at`

---

## `repertoire_tags`

Many-to-many relationship.

Fields:

- `repertoire_entry_id`
- `tag_id`

---

## `play_events`

Fields:

- `id`
- `repertoire_entry_id`
- `played_at`

---

## `attachments`

Fields:

- `id`
- `repertoire_entry_id`
- `type`
  - pdf
  - midi
- `filename`
- `label` nullable
- `storage_key`
- `size_bytes`
- `created_at`

---

# 22. Optional Metadata

Useful fields, but they must never make song creation feel heavy.

- Album
- Genre
- BPM
- Difficulty
- Capo
- Favorite
- Date added

These belong behind the detailed edit screen.

---

# 23. UX Detail: Tuning Mode

Useful dedicated view.

Example:

User selects:

`Drop D`

The app immediately shows all Drop D songs grouped by status:

- Learning
- Can Play
- Mastered
- Want to Play

This supports a real guitar workflow:

> The guitar is already in Drop D — what else can I play before retuning?

This can simply be a specialized Library state rather than a separate database feature.

---

# 24. UX Detail: Resource Launcher

On a song card/detail, show compact actions such as:

- `TAB`
- `ORIGINAL`
- `COVER`
- `BACKING`
- `LESSON`

One tap opens the preferred resource.

If multiple resources exist in one category:

- tap opens primary resource
- long press / dropdown shows all versions

Desktop alternative:

- click primary
- chevron opens alternatives

---

# 25. UX Detail: Duplicate Detection

When adding a song:

Check normalized:

- artist
- song title

If a likely duplicate exists:

> "This song may already exist."

Actions:

- Add resource to existing song
- Create another entry anyway

This is especially valuable when adding URLs quickly from the Share Target.

---

# 26. Import / Export / Backup

Recommended even for a single-user app.

Export:

- JSON full backup
- CSV song list

JSON should include:

- songs
- repertoire entries
- resource links
- tags
- play history
- attachment metadata

Files themselves can optionally be exported separately later.

Import:

- restore JSON backup

---

# 27. Settings

Suggested settings:

- Default instrument
- Default status when adding a song
- Manage tunings
- Manage tags
- Access/session
- Offline cache
- Import
- Export
- Clear local cache
- App install information

---

# 28. Technology Stack

## Frontend

- React
- Next.js
- TypeScript
- PWA
- Responsive desktop/tablet/mobile UI

Recommended:

- App Router
- Server Actions / Route Handlers where appropriate
- IndexedDB for offline data/cache
- Service Worker for PWA/offline behavior

---

## Database

- Neon Postgres

Recommended schema migration layer:

- Drizzle ORM

Alternative:

- Prisma

Drizzle is preferable for this relatively small, explicit relational model.

---

## File Storage

- Neon Object Storage

Used for:

- PDF
- MIDI

---

## Hosting

- Vercel

Deployment flow:

`GitHub → push/merge to main → automatic Vercel production deployment`

Preview deployments can be created from branches/PRs.

---

## External APIs

### YouTube Data API

Purpose:

- video title
- channel
- thumbnail
- duration
- canonical metadata

Use only after the user provides a YouTube URL.

No YouTube search feature is required.

Cache metadata in Postgres so the API does not need to be called repeatedly.

---

## Songsterr

MVP:

- manual URL
- open external app/site

No external dependency required.

---

# 29. Suggested API Routes / Server Actions

Possible server endpoints/actions:

### Authentication

- `POST /api/auth/login`
- `POST /api/auth/logout`

### Songs

- `POST /api/songs`
- `PATCH /api/songs/:id`
- `DELETE /api/songs/:id`

### Repertoire

- `POST /api/repertoire`
- `PATCH /api/repertoire/:id`
- `DELETE /api/repertoire/:id`

### Resources

- `POST /api/resources`
- `PATCH /api/resources/:id`
- `DELETE /api/resources/:id`
- `POST /api/resources/enrich`

### Played

- `POST /api/repertoire/:id/play`
- `DELETE /api/play-events/:id`

### Tags

- CRUD tags
- attach/detach tag

### Attachments

- upload
- delete
- download/sign URL

### Backup

- `GET /api/export`
- `POST /api/import`

---

# 30. MVP Scope

Build these first.

## Core

- Single-user access-code authentication
- Guitar repertoire
- Song creation/edit/delete
- Statuses
- Tuning
- Tags
- Songsterr URL
- Multiple resources per song
- YouTube resource enrichment
- Default resource categories
- Custom resource labels
- Home dashboard
- Library
- Primary filters
- Advanced filters
- `+1 Played`
- Last played
- Play count
- Recently played
- Not played recently
- PDF attachments
- MIDI attachments
- Responsive PWA
- Offline library cache
- GitHub → Vercel automatic deployment

---

# 31. V1.1

Good features immediately after MVP.

- Android PWA Share Target
- Duplicate detection
- Resource drag-and-drop
- Primary resource per category
- Tuning Mode
- JSON backup/export
- CSV export
- Offline mutation queue
- PDF/MIDI local caching
- Bass UI enabled
- Piano UI enabled

---

# 32. Later / Optional

Only add if actual usage creates the need.

- Local search
- Command palette
- Songsterr metadata enrichment
- Experimental Songsterr search
- YouTube embedded player
- Statistics screen
- Most played songs
- Play history charts
- Custom smart collections
- Keyboard shortcuts
- Bulk edit
- Bulk tagging
- Import from spreadsheets
- Browser extension
- Chrome context-menu integration

---

# 33. Explicit Non-Goals

Do not turn the product into:

- a Songsterr clone
- a tab editor
- a tablature renderer
- a Spotify replacement
- a YouTube search engine
- a guitar lesson app
- a practice timer
- a streak/gamification product
- an AI music teacher
- a metronome
- a tuner
- a social network

The value is organization and instant access.

---

# 34. Recommended Product Behavior

The product should optimize this sequence:

```text
I discover a useful song/video
        ↓
Share or paste it into the app
        ↓
Associate it with a song
        ↓
Choose resource category
        ↓
Choose status + tuning
        ↓
Save
        ↓
It is now part of my permanent repertoire
```

And later:

```text
I pick up the guitar
        ↓
Open the app
        ↓
Filter by tuning/status/tag
        ↓
Pick a song
        ↓
Open Songsterr / Original / Cover / Backing Track
        ↓
Play
        ↓
Tap +1
```

---

# 35. Ten Name Ideas

Names intentionally avoid making the product guitar-only because Bass and Piano are planned.

1. **TuneDeck**
   - Feels like a personal deck/library of songs.
   - Short and works across instruments.

2. **PlayStack**
   - A stack of everything you play or want to play.
   - Fits the software/developer aesthetic.

3. **SongShelf**
   - Very literal: your personal shelf of playable songs.

4. **RiffDeck**
   - More guitar-centric and energetic.
   - Still usable if Guitar remains the main instrument.

5. **TuneVault**
   - Emphasizes permanent organization and saved resources.

6. **RepDeck**
   - Short for repertoire deck.
   - Distinctive and compact.

7. **SongDock**
   - A central dock where all resources for a song live.

8. **Playfolio**
   - Portfolio of songs you can play.

9. **TrackNest**
   - One place where songs and their related resources live together.

10. **TabShelf**
    - Strong guitar identity.
    - Less ideal if Piano becomes important later.

## Recommended Working Name

**TuneDeck**

Reasons:

- short
- easy to remember
- not restricted to guitar
- works with the card/deck visual metaphor
- fits the concept of browsing a personal collection
- easy to turn into an app icon/brand later

---

# 36. Product Summary

TuneDeck is a private PWA for managing a personal musical repertoire.

Its central entity is not simply a song: it is a **playable repertoire entry** with:

- instrument
- status
- tuning
- tags
- Songsterr tab
- categorized YouTube resources
- PDF/MIDI attachments
- play count
- last played date

The app intentionally favors:

- fast manual capture
- lightweight automatic enrichment
- organization
- filtering
- one-tap access to external resources

over complicated practice-management features.

The MVP should feel useful after adding the first five songs and remain organized after adding hundreds.
