# /vsl — private class (video + comments)

Single page, mobile-first, plain HTML/CSS/JS. Two blocks: video (VTurb) and comments, with a fixed top bar and a moving background. All copy is in English.

## Variables (top of the `<script>` in `index.html`, `CONFIG` object)

| Variable | What it does |
|---|---|
| `TRICK_START` | Exact second where the demonstration starts (now `325` = 5:25). **Update if the video is edited.** |
| `TRICK_END` | Second where the demonstration ends (now `505`, **to confirm**). After it the bar goes back to "Private access · 18+ content". |
| `TITLE` | Serif headline (option B is commented next to it). |
| `BG_VIDEO` / `BG_POSTER` | Optional background video (desktop only, muted loop, ≤ 1.5 MB) and WebP poster. Mobile never loads video. |

## Comments

- The feed comes from `comments.json` (comments sent directly by viewers). Only items with `"authorized": true` are shown.
- Names are shown as first name + last initial. No dates/likes are set, so no time or counter is shown; add `date` (ISO) and `likes` when you have real values and the "Newest / Most liked" sort appears.
- Visitors can comment (name + comment + Publish). Their comment is saved **only in their own browser** (localStorage) and is not sent anywhere.
