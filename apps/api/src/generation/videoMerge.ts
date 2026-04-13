import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import axios from "axios";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ─── DOWNLOAD FILE TO TEMP ────────────────────────────────────────────────────
async function downloadToTemp(url: string, ext: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `aura-x-${uuidv4()}.${ext}`);
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
  });
  fs.writeFileSync(tmpPath, Buffer.from(response.data));
  return tmpPath;
}

// ─── MERGE VIDEO + AUDIO ─────────────────────────────────────────────────────
// Uses ffmpeg to combine a video file (no audio) with an audio file.
// Output is trimmed to the shorter of the two (-shortest).
// Returns a Buffer containing the merged MP4.

// ─── MERGE FROM URLS ─────────────────────────────────────────────────────────
export async function mergeVideoAudio(
  videoUrl: string,
  audioUrl: string
): Promise<Buffer> {
  const audioExt = audioUrl.includes(".mp3") ? "mp3" : "m4a";
  const audioPath = await downloadToTemp(audioUrl, audioExt);
  try {
    return await mergeVideoAudioBuffer(videoUrl, fs.readFileSync(audioPath), audioExt);
  } finally {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

// ─── MERGE FROM VIDEO URL + AUDIO BUFFER ────────────────────────────────────
// Used when the audio comes from a file upload (multer buffer).
export async function mergeVideoAudioBuffer(
  videoUrl: string,
  audioBuffer: Buffer,
  filename: string = "audio.mp3"
): Promise<Buffer> {
  const audioExt = filename.endsWith(".mp3") ? "mp3" : "m4a";
  const outPath = path.join(os.tmpdir(), `aura-x-merged-${uuidv4()}.mp4`);

  let videoPath: string | null = null;
  let audioPath: string | null = null;

  try {
    console.log("[merge] Downloading video...");
    videoPath = await downloadToTemp(videoUrl, "mp4");

    audioPath = path.join(os.tmpdir(), `aura-x-audio-${uuidv4()}.${audioExt}`);
    fs.writeFileSync(audioPath, audioBuffer);

    console.log("[merge] Merging with ffmpeg (video loops to match audio length)...");
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath!)
        .inputOptions(["-stream_loop -1"])  // loop video indefinitely
        .input(audioPath!)
        .outputOptions([
          "-c:v libx264",         // re-encode so looped frames are valid
          "-preset fast",
          "-crf 23",
          "-c:a aac",
          "-b:a 192k",
          "-shortest",            // stop when audio ends
          "-movflags +faststart",
        ])
        .output(outPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const merged = fs.readFileSync(outPath);
    console.log(`[merge] Done — ${(merged.length / 1024 / 1024).toFixed(2)} MB`);
    return merged;
  } finally {
    for (const p of [videoPath, audioPath, outPath]) {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }
}
