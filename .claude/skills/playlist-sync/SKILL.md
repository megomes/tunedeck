---
name: playlist-sync
description: Pulls new videos from the user's "Guitar v2" YouTube playlist (guitar covers of songs they want to play) into the TuneDeck Library > Backlog. Use when they ask to sync/import/update the playlist, "pega as novidades da playlist", or add the playlist songs to TuneDeck.
---

# Playlist → TuneDeck Backlog

The playlist is always https://www.youtube.com/playlist?list=PL8HBPDLAQBBLEmOYUdEWoRgUycSotH2KB
(unlisted). Everything goes through `scripts/playlist-sync.mjs`, which talks to the deployed app's
API (`/api/snapshot`, `/api/ops`) with a session saved in `.env.sync` (git-ignored). It needs `yt-dlp` on PATH.

## Steps

1. **List what's new**

   ```bash
   node scripts/playlist-sync.mjs new "<scratchpad>/new.json"
   ```

   - "Not signed in" / "Session expired": open
     `powershell -ExecutionPolicy Bypass -File scripts/playlist-login.ps1` in the user's terminal
     (run_in_terminal) and ask them to type the access code there (the raw-mode prompt of
     `playlist-sync.mjs login` gets no keystrokes in the app's terminal panel). Never type the code
     yourself, even if they paste it in chat. HTTP 429 = wait a minute after failed attempts.
   - "The playlist does not exist": it was made private; ask them to set it back to *Unlisted*.
   - `newVideos` empty → tell them there's nothing new and stop.

2. **Write a plan** (`<scratchpad>/plan.json`) from `newVideos`, grouping videos of the same song:

   ```json
   [{ "title": "Scar Tissue", "artist": "Red Hot Chili Peppers", "videos": [{ "id": "xVphdYl6JxQ" }] }]
   ```

   - Clean names: just the song title and the original artist, proper capitalization. Drop "Guitar
     Cover", "Tab", "Lesson", "BEST VERSION", channel names, emojis, etc. ("Another Brick in the Wall,
     Pt. 2", "Snow (Hey Oh)", "I Love Rock 'n' Roll").
   - Several videos of the same song (full cover, solo only, riff, lesson) go in **one** item.
   - If the song is already in `songs` (any status), set `"entryId"` to that guitar entry so the video
     is added to it instead of creating a duplicate. Same title + artist is matched automatically too.
   - Covers of a famous version: credit the artist named in the video ("Little Wing" by Stevie Ray
     Vaughan stays SRV; "Old Love" by Eric Clapton even if played John Mayer style).
   - Improvs / originals by the channel itself (blues jams, "Ghost of the Mountain"): title like
     "Slow Blues in C Minor (Improv)", artist = the guitarist. Unclear title → check the video
     description with `yt-dlp --skip-download --print description <url>`.
   - Every video is a `guitar_cover` by default. They split riffs/solos themselves later; don't ask.

3. **Apply**

   ```bash
   node scripts/playlist-sync.mjs apply "<scratchpad>/plan.json"
   ```

   New songs land at the top of **Backlog** (guitar) in plan order; video title, channel and duration
   are filled from the playlist. It's idempotent: videos already on an entry are skipped.
   Then each touched song without a tab gets its Songsterr tab (most viewed exact match, via
   `desktop/songsterr.js`) and, when its tuning is empty, the tab's tuning. `node scripts/playlist-sync.mjs tabs`
   does that for the whole library. Tabs or tunings set by hand are never replaced.
   Every handled video id goes into the `playlistSeen` setting, so songs the user deleted never come
   back. The app's **Playlist** button (phone + desktop app, `desktop/main.js` → `syncPlaylist`) does the
   same flow with `claude -p` on the PC and shares that setting.

4. Report: how many songs were created, which videos were merged into existing songs, and anything
   whose name you had to guess.
