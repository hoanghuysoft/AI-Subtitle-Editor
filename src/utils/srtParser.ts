import { SubtitleBlock } from "../types";

/**
 * Parses raw SRT subtitle content into structured subtitle blocks.
 * Resilient to formatting inconsistencies, extra spaces, and CRLF line endings.
 */
export function parseSRT(srtText: string): SubtitleBlock[] {
  const blocks: SubtitleBlock[] = [];
  const normalizedSrt = srtText.replace(/\r\n/g, "\n");
  
  // Split on double newlines (with optional whitespace) to isolate chunks
  const sections = normalizedSrt.split(/\n\s*\n/);
  let fallbackId = 1;

  for (const section of sections) {
    const rawSection = section.trim();
    if (!rawSection) continue;

    const lines = rawSection.split("\n").map(l => l.trim());
    if (lines.length < 2) continue;

    let id = parseInt(lines[0], 10);
    let timecodeLine = lines[1];
    let textStartIndex = 2;

    // Resilient index and timecode correction
    if (isNaN(id) || !timecodeLine || !timecodeLine.includes("-->")) {
      // Check if lines[0] contains timecode instead
      if (lines[0].includes("-->")) {
        timecodeLine = lines[0];
        id = fallbackId;
        textStartIndex = 1;
      } else {
        // Scan for timecode line
        const foundTimecodeIndex = lines.findIndex(l => l.includes("-->"));
        if (foundTimecodeIndex !== -1) {
          timecodeLine = lines[foundTimecodeIndex];
          id = foundTimecodeIndex > 0 ? parseInt(lines[foundTimecodeIndex - 1], 10) : fallbackId;
          id = isNaN(id) ? fallbackId : id;
          textStartIndex = foundTimecodeIndex + 1;
        } else {
          // If no timecode found, ignore block as invalid
          continue;
        }
      }
    }

    const timeParts = timecodeLine.split("-->").map(p => p.trim());
    if (timeParts.length < 2) continue;

    const startTime = timeParts[0];
    const endTime = timeParts[1];
    const subtitleText = lines.slice(textStartIndex).join("\n");

    blocks.push({
      id: isNaN(id) ? fallbackId : id,
      startTime,
      endTime,
      text: subtitleText,
      status: "pending"
    });

    fallbackId = (isNaN(id) ? fallbackId : id) + 1;
  }

  // Sort blocks sequentially by original index/timeline
  return blocks.sort((a, b) => a.id - b.id);
}

/**
 * Converts a standard SRT timecode (HH:MM:SS,mmm or HH:MM:SS.mmm) to milliseconds.
 */
export function timecodeToMs(timecode: string): number {
  if (!timecode) return 0;
  const parts = timecode.trim().split(/[:.,]/);
  if (parts.length < 3) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;
  const ms = parseInt(parts[3], 10) || 0;
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + ms;
}

/**
 * Converts a millisecond number back to a standard SRT timecode (HH:MM:SS,mmm).
 */
export function msToTimecode(totalMs: number): string {
  if (isNaN(totalMs) || totalMs < 0) totalMs = 0;
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor(totalMs % 1000);

  const pad = (n: number, size: number = 2) => String(n).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms, 3)}`;
}

/**
 * Serializes the blocks of subtitle state back into a valid SRT file format.
 */
export function stringifySRT(
  blocks: SubtitleBlock[],
  exportType: "translated" | "bilingual" | "bilingual-reverse" | "original"
): string {
  return blocks
    .map((block) => {
      let outputText = block.text;

      if (exportType === "translated") {
        outputText = block.translatedText || block.text; // fallback
      } else if (exportType === "bilingual") {
        outputText = `${block.text}\n${block.translatedText || block.text}`;
      } else if (exportType === "bilingual-reverse") {
        outputText = `${block.translatedText || block.text}\n${block.text}`;
      }

      return `${block.id}\n${block.startTime} --> ${block.endTime}\n${outputText}`;
    })
    .join("\n\n") + "\n";
}
