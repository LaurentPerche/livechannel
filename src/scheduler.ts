import type { ChannelStateResponse, Env, PlaybackMode, UserPlaybackState, Video } from "./types";
import { errorResponse, jsonResponse, keys, listJsonByPrefix, readJson, toVideoSummary } from "./utils";

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPLAY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const QUEUE_SIZE = 8;

export class UserScheduler {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = request.headers.get("x-user-id") ?? url.searchParams.get("userId");

    if (!userId) {
      return errorResponse("Missing user id", 400);
    }

    if (url.pathname === "/state" || url.pathname === "/next") {
      return jsonResponse(await this.getChannelState(userId));
    }

    if (url.pathname === "/video-ended" && request.method === "POST") {
      return jsonResponse(await this.videoEnded(userId));
    }

    if (url.pathname === "/jump" && request.method === "POST") {
      const body = await readJson<{ videoId?: string }>(request);
      if (!body.videoId || !/^[\w-]{6,}$/.test(body.videoId)) {
        return errorResponse("Invalid videoId", 400);
      }

      const target = await this.getVideo(userId, body.videoId);
      if (!target) {
        return errorResponse("Video was not found for this channel", 404);
      }

      return jsonResponse(await this.jump(userId, body.videoId));
    }

    if (url.pathname === "/new-video" && request.method === "POST") {
      return jsonResponse(await this.newVideoDetected(userId));
    }

    if (url.pathname === "/reset" && request.method === "POST") {
      const fresh = this.emptyState(userId);
      await this.state.storage.put("playback", fresh);
      return jsonResponse(await this.getChannelState(userId));
    }

    return errorResponse("Not found", 404);
  }

  private emptyState(userId: string): UserPlaybackState {
    const now = new Date().toISOString();
    return {
      userId,
      queue: [],
      mode: "fresh",
      seenVideoIds: [],
      skippedVideoIds: [],
      replayHistory: [],
      lastInteractionAt: now,
      lastQueueBuildAt: now
    };
  }

  private async readState(userId: string): Promise<UserPlaybackState> {
    return (await this.state.storage.get<UserPlaybackState>("playback")) ?? this.emptyState(userId);
  }

  private async writeState(playbackState: UserPlaybackState): Promise<void> {
    await this.state.storage.put("playback", playbackState);
  }

  private async getVideo(userId: string, videoId: string): Promise<Video | null> {
    return this.env.VIDEOS_KV.get<Video>(keys.video(userId, videoId), "json");
  }

  private async getVideos(userId: string): Promise<Video[]> {
    return listJsonByPrefix<Video>(this.env.VIDEOS_KV, keys.videoPrefix(userId));
  }

  private async getChannelState(userId: string): Promise<ChannelStateResponse> {
    const playbackState = await this.rebuildQueue(await this.readState(userId));
    await this.writeState(playbackState);
    return this.toResponse(playbackState, await this.getVideos(userId));
  }

  private async videoEnded(userId: string): Promise<ChannelStateResponse> {
    const playbackState = await this.readState(userId);
    const currentId = playbackState.currentVideoId;

    if (currentId) {
      const wasSeen = playbackState.seenVideoIds.includes(currentId);
      const currentVideo = await this.getVideo(userId, currentId);

      if (wasSeen) {
        playbackState.replayHistory = [
          ...playbackState.replayHistory.filter((entry) => entry.videoId !== currentId),
          { videoId: currentId, replayedAt: new Date().toISOString() }
        ];
      } else {
        playbackState.seenVideoIds = unique([...playbackState.seenVideoIds, currentId]);
      }

      playbackState.lastPlayedChannelId = currentVideo?.channelId ?? playbackState.lastPlayedChannelId;
    }

    playbackState.currentVideoId = undefined;
    playbackState.queue = [];
    playbackState.lastInteractionAt = new Date().toISOString();

    const rebuilt = await this.rebuildQueue(playbackState);
    await this.writeState(rebuilt);
    return this.toResponse(rebuilt, await this.getVideos(userId));
  }

  private async jump(userId: string, videoId: string): Promise<ChannelStateResponse> {
    const playbackState = await this.readState(userId);

    if (playbackState.currentVideoId && playbackState.currentVideoId !== videoId) {
      playbackState.skippedVideoIds = unique([...playbackState.skippedVideoIds, playbackState.currentVideoId]);
    }

    playbackState.currentVideoId = videoId;
    playbackState.queue = playbackState.queue.filter((queuedId) => queuedId !== videoId);
    playbackState.skippedVideoIds = playbackState.skippedVideoIds.filter((skippedId) => skippedId !== videoId);
    playbackState.lastInteractionAt = new Date().toISOString();

    const rebuilt = await this.rebuildQueue(playbackState);
    await this.writeState(rebuilt);
    return this.toResponse(rebuilt, await this.getVideos(userId));
  }

  private async newVideoDetected(userId: string): Promise<ChannelStateResponse> {
    const playbackState = await this.readState(userId);
    const rebuilt = await this.rebuildQueue(playbackState);
    await this.writeState(rebuilt);
    return this.toResponse(rebuilt, await this.getVideos(userId));
  }

  private async rebuildQueue(playbackState: UserPlaybackState): Promise<UserPlaybackState> {
    const videos = await this.getVideos(playbackState.userId);
    const byId = new Map(videos.map((video) => [video.videoId, video]));
    const now = Date.now();
    const seen = new Set(playbackState.seenVideoIds);
    const skipped = new Set(playbackState.skippedVideoIds);

    if (playbackState.currentVideoId && !byId.has(playbackState.currentVideoId)) {
      playbackState.currentVideoId = undefined;
    }

    const unseen = videos.filter((video) => !seen.has(video.videoId) && !skipped.has(video.videoId));
    const fresh = rankVideos(unseen.filter((video) => now - Date.parse(video.publishedAt) <= FRESHNESS_WINDOW_MS));
    const catchUp = rankVideos(unseen.filter((video) => now - Date.parse(video.publishedAt) > FRESHNESS_WINDOW_MS));
    const replay = rankVideos(
      videos.filter(
        (video) => seen.has(video.videoId) && !skipped.has(video.videoId) && this.lastReplayAt(playbackState, video.videoId) <= now - REPLAY_COOLDOWN_MS
      )
    );
    const emergencyReplay = rankVideos(videos.filter((video) => seen.has(video.videoId) && !skipped.has(video.videoId)));

    if (!playbackState.currentVideoId) {
      const selected = fresh[0] ?? catchUp[0] ?? replay[0] ?? emergencyReplay[0];
      playbackState.currentVideoId = selected?.videoId;
    }

    const currentVideo = playbackState.currentVideoId ? byId.get(playbackState.currentVideoId) : undefined;
    const currentMode = currentVideo ? this.modeForVideo(playbackState, currentVideo, now) : modeForPools(fresh, catchUp);
    const pools = currentMode === "fresh" ? [fresh, catchUp, replay.length ? replay : emergencyReplay] : currentMode === "catch_up" ? [catchUp, replay.length ? replay : emergencyReplay] : [replay.length ? replay : emergencyReplay];
    const candidates = uniqueVideos(pools.flat()).filter((video) => video.videoId !== playbackState.currentVideoId);
    const lastChannelId = currentVideo?.channelId ?? playbackState.lastPlayedChannelId;

    playbackState.queue = pickQueue(candidates, lastChannelId, QUEUE_SIZE).map((video) => video.videoId);
    playbackState.mode = currentMode;
    playbackState.lastQueueBuildAt = new Date().toISOString();
    return playbackState;
  }

  private modeForVideo(playbackState: UserPlaybackState, video: Video, now: number): PlaybackMode {
    if (playbackState.seenVideoIds.includes(video.videoId)) return "replay";
    return now - Date.parse(video.publishedAt) <= FRESHNESS_WINDOW_MS ? "fresh" : "catch_up";
  }

  private lastReplayAt(playbackState: UserPlaybackState, videoId: string): number {
    const entry = playbackState.replayHistory.find((candidate) => candidate.videoId === videoId);
    return entry ? Date.parse(entry.replayedAt) : 0;
  }

  private toResponse(playbackState: UserPlaybackState, videos: Video[]): ChannelStateResponse {
    const byId = new Map(videos.map((video) => [video.videoId, video]));
    const current = playbackState.currentVideoId ? byId.get(playbackState.currentVideoId) : undefined;
    const next = playbackState.queue
      .map((videoId) => byId.get(videoId))
      .filter((video): video is Video => Boolean(video))
      .slice(0, 3)
      .map(toVideoSummary);

    return {
      current: current ? toVideoSummary(current) : null,
      next,
      mode: playbackState.mode
    };
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function rankVideos(videos: Video[]): Video[] {
  return [...videos].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function uniqueVideos(videos: Video[]): Video[] {
  const seen = new Set<string>();
  const result: Video[] = [];

  for (const video of videos) {
    if (!seen.has(video.videoId)) {
      seen.add(video.videoId);
      result.push(video);
    }
  }

  return result;
}

function modeForPools(fresh: Video[], catchUp: Video[]): PlaybackMode {
  if (fresh.length > 0) return "fresh";
  if (catchUp.length > 0) return "catch_up";
  return "replay";
}

function pickQueue(candidates: Video[], lastChannelId: string | undefined, size: number): Video[] {
  const remaining = [...candidates];
  const selected: Video[] = [];
  let previousChannelId = lastChannelId;

  while (remaining.length > 0 && selected.length < size) {
    const nonRepeatingIndex = remaining.findIndex((video) => video.channelId !== previousChannelId);
    const index = nonRepeatingIndex >= 0 ? nonRepeatingIndex : 0;
    const [next] = remaining.splice(index, 1);
    selected.push(next);
    previousChannelId = next.channelId;
  }

  return selected;
}
