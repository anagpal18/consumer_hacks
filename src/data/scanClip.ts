import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

import type { ScanFrame, ScanStartResult, StorageUploadResponse } from '@shared/contract';

import { generateUploadUrl, startScan } from './api';
import { IS_FIXTURE_MODE } from './mode';

export const DEFAULT_FRAME_COUNT = 10;
const MIN_FRAMES = 3;
const MAX_CLIP_SECONDS = 60;

export type PickedClip = { uri: string; durationMs: number | null };

export type ScanClipProgress =
  | { step: 'extracting' }
  | { step: 'uploading-video'; reason: string }
  | { step: 'uploading'; done: number; total: number }
  | { step: 'starting' };

/** Opens the library or camera roll for a video. Resolves null when the user cancels. */
export async function pickClip(source: 'library' | 'camera' = 'library'): Promise<PickedClip | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], videoMaxDuration: MAX_CLIP_SECONDS };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is needed to record a closet clip.');
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, durationMs: asset.duration ?? null } : null;
}

function waitUntilLoaded(player: VideoPlayer): Promise<void> {
  if (player.status === 'readyToPlay') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const subscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        subscription.remove();
        resolve();
      } else if (status === 'error') {
        subscription.remove();
        reject(new Error(error?.message ?? 'Could not read the clip.'));
      }
    });
  });
}

/** Evenly spaced timestamps in ms, centered in equal slices so the first and last frames avoid fades. */
export function frameTimestamps(durationMs: number, count = DEFAULT_FRAME_COUNT): number[] {
  return Array.from({ length: count }, (_, index) => Math.round(((index + 0.5) * durationMs) / count));
}

/** Extracts about `count` JPEG frames from a local clip. iOS and Android only. */
export async function extractFrames(clip: PickedClip, count = DEFAULT_FRAME_COUNT): Promise<{ uri: string; timestampMs: number }[]> {
  const player = createVideoPlayer(clip.uri);
  try {
    await waitUntilLoaded(player);
    const durationMs = clip.durationMs ?? player.duration * 1000;
    if (!durationMs) throw new Error('The clip has no length.');
    const timestamps = frameTimestamps(durationMs, count);
    const thumbnails = await player.generateThumbnailsAsync(timestamps.map((ms) => ms / 1000), { maxWidth: 1280, maxHeight: 1280 });
    const frames: { uri: string; timestampMs: number }[] = [];
    for (const [index, thumbnail] of thumbnails.entries()) {
      const image = await ImageManipulator.manipulate(thumbnail).renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
      frames.push({ uri: saved.uri, timestampMs: Math.round((thumbnail.actualTime ?? thumbnail.requestedTime) * 1000) || timestamps[index] });
    }
    return frames;
  } finally {
    player.release();
  }
}

async function uploadFile(uri: string, contentType: string): Promise<string> {
  const uploadUrl = await generateUploadUrl();
  const body = await (await fetch(uri)).blob();
  const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': contentType }, body });
  if (!response.ok) throw new Error(`Frame upload failed (${response.status}).`);
  const { storageId } = (await response.json()) as StorageUploadResponse;
  return storageId;
}

/** Uploads frames to Convex storage. In fixture mode nothing leaves the phone. */
export async function uploadFrames(
  frames: { uri: string; timestampMs: number }[],
  onProgress?: (progress: ScanClipProgress) => void,
): Promise<ScanFrame[]> {
  const uploaded: ScanFrame[] = [];
  for (const [index, frame] of frames.entries()) {
    onProgress?.({ step: 'uploading', done: index, total: frames.length });
    const storageId = IS_FIXTURE_MODE ? `storage_fixture_f${index + 1}` : await uploadFile(frame.uri, 'image/jpeg');
    uploaded.push({ frameId: `f${index + 1}`, storageId, timestampMs: frame.timestampMs });
  }
  onProgress?.({ step: 'uploading', done: frames.length, total: frames.length });
  return uploaded;
}

/**
 * Clip in, scan job out: extract frames, upload them, then call scans:start. If extraction
 * throws or yields fewer than 3 frames, uploads the whole clip instead and lets the
 * server extract frames (scans:start with videoStorageId and no frames). Watch the job with useScan.
 */
export async function scanClip(clip: PickedClip, onProgress?: (progress: ScanClipProgress) => void): Promise<ScanStartResult> {
  onProgress?.({ step: 'extracting' });
  let frames: { uri: string; timestampMs: number }[] = [];
  let fallbackReason: string | undefined;
  try {
    frames = await extractFrames(clip);
    if (frames.length < MIN_FRAMES) fallbackReason = `Only ${frames.length} frames extracted`;
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : String(error);
  }
  if (fallbackReason) {
    onProgress?.({ step: 'uploading-video', reason: fallbackReason });
    const videoStorageId = IS_FIXTURE_MODE ? 'storage_fixture_video' : await uploadFile(clip.uri, 'video/mp4');
    onProgress?.({ step: 'starting' });
    return startScan({ frames: [], videoStorageId });
  }
  const uploaded = await uploadFrames(frames, onProgress);
  onProgress?.({ step: 'starting' });
  return startScan({ frames: uploaded });
}
