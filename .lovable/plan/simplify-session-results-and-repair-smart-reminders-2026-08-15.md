# Simplify Session Results and Repair Smart Reminders

## Changes
- Keep the recording experience unchanged.
- Reduce post-recording tabs to Summary, Concepts, Transcript, and Playback; remove Key Points and extra note/task panels from that screen.
- Make keyword taps open a simple in-app meaning sheet only, with no Wikipedia or external resource links.
- Persist each AI-detected deadline as a reminder, notify the reminder UI immediately, and schedule exact-time in-app plus browser alerts while Echo is open.
- Ensure reminders without a valid spoken time remain visible but are not falsely scheduled.
- Add a Share button on the Playback tab so a saved recording can be sent to WhatsApp or any other app via the device share sheet, with a download fallback when sharing is unavailable.

## Verification
- Confirm the four result tabs render correctly.
- Record or seed a deadline, verify it appears under Upcoming immediately, and verify an exact-time alert fires.
- Run focused checks for edited files and inspect the live preview.
- Confirm the Share button appears with playback and falls back to downloading the audio file when the browser cannot share.

## Technical details
- Preserve existing stored session data for compatibility; this is a presentation change rather than a destructive schema migration.
- Share the stored audio as a real file through the Web Share API, falling back to a direct file download on unsupported browsers.
- Use a shared reminder-change event so the global watcher reschedules as soon as recording creates a reminder instead of waiting for polling.
