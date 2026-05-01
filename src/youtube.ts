import type { Env, Subscription, User, Video } from "./types";
import { getJson, keys, putJson, putUser, requireConfigured } from "./utils";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: "Bearer";
  id_token?: string;
}

interface GoogleProfile {
  sub: string;
  email: string;
}

interface YouTubeListResponse<T> {
  nextPageToken?: string;
  items: T[];
}

interface YouTubeSubscriptionItem {
  snippet: {
    title: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
    resourceId: {
      channelId: string;
    };
  };
}

interface YouTubeChannelItem {
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
}

interface YouTubePlaylistItem {
  snippet: {
    title: string;
    description?: string;
    channelTitle?: string;
    publishedAt: string;
    thumbnails?: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
      maxres?: { url: string };
    };
    resourceId?: {
      videoId?: string;
    };
  };
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PROFILE_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export async function exchangeCodeForTokens(env: Env, code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireConfigured(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
    client_secret: requireConfigured(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireConfigured(env.GOOGLE_REDIRECT_URI, "GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code"
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed with ${response.status}`);
  }

  return response.json();
}

export async function refreshAccessToken(env: Env, user: User): Promise<User> {
  if (!user.refreshToken) {
    throw new Error("Google refresh token is missing");
  }

  const body = new URLSearchParams({
    client_id: requireConfigured(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
    client_secret: requireConfigured(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
    refresh_token: user.refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed with ${response.status}`);
  }

  const tokens = (await response.json()) as GoogleTokenResponse;
  const updatedUser: User = {
    ...user,
    accessToken: tokens.access_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    updatedAt: new Date().toISOString()
  };

  await putUser(env, updatedUser);
  return updatedUser;
}

export async function getValidAccessToken(env: Env, user: User): Promise<{ user: User; accessToken: string }> {
  if (user.accessToken && user.tokenExpiry > Date.now() + 60_000) {
    return { user, accessToken: user.accessToken };
  }

  const updated = await refreshAccessToken(env, user);
  return { user: updated, accessToken: updated.accessToken };
}

export async function fetchUserProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_PROFILE_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Google profile fetch failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchSubscriptions(accessToken: string): Promise<Subscription[]> {
  const subscriptions: Subscription[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${YOUTUBE_API_BASE}/subscriptions`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error(`YouTube subscriptions fetch failed with ${response.status}`);
    }

    const body = (await response.json()) as YouTubeListResponse<YouTubeSubscriptionItem>;
    pageToken = body.nextPageToken;

    for (const item of body.items) {
      subscriptions.push({
        channelId: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
        lastCheckedAt: undefined
      });
    }
  } while (pageToken);

  return subscriptions;
}

async function getUploadsPlaylistId(env: Env, channelId: string): Promise<string> {
  const cached = await env.VIDEOS_KV.get(keys.channelUploadsPlaylist(channelId));
  if (cached) return cached;

  const apiKey = requireConfigured(env.YOUTUBE_API_KEY, "YOUTUBE_API_KEY");
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", channelId);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube channel fetch failed with ${response.status}`);
  }

  const body = (await response.json()) as YouTubeListResponse<YouTubeChannelItem>;
  const playlistId = body.items[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) {
    throw new Error(`Uploads playlist not found for channel ${channelId}`);
  }

  await env.VIDEOS_KV.put(keys.channelUploadsPlaylist(channelId), playlistId, { expirationTtl: 60 * 60 * 24 * 30 });
  return playlistId;
}

export async function fetchRecentUploadsForChannel(env: Env, subscription: Subscription, maxResults = 8): Promise<Video[]> {
  const cached = await getJson<Video[]>(env.VIDEOS_KV, keys.channelRecentUploads(subscription.channelId));
  if (cached) return cached;

  const apiKey = requireConfigured(env.YOUTUBE_API_KEY, "YOUTUBE_API_KEY");
  const playlistId = await getUploadsPlaylistId(env, subscription.channelId);
  const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey);

  // Quota note: channels.list and playlistItems.list are much cheaper than search.list.
  // The recent-upload cache keeps the cron path from repeatedly spending quota for each user.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube recent uploads fetch failed with ${response.status}`);
  }

  const body = (await response.json()) as YouTubeListResponse<YouTubePlaylistItem>;
  const detectedAt = new Date().toISOString();
  const videos = body.items
    .map((item): Video | null => {
      const videoId = item.contentDetails?.videoId ?? item.snippet.resourceId?.videoId;
      if (!videoId) return null;

      return {
        videoId,
        channelId: subscription.channelId,
        channelTitle: item.snippet.channelTitle ?? subscription.title,
        title: item.snippet.title,
        description: item.snippet.description ?? "",
        thumbnailUrl:
          item.snippet.thumbnails?.maxres?.url ??
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          "",
        publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet.publishedAt,
        detectedAt
      };
    })
    .filter((video): video is Video => video !== null);

  await putJson(env.VIDEOS_KV, keys.channelRecentUploads(subscription.channelId), videos, { expirationTtl: 60 * 10 });
  return videos;
}

export async function fetchRecentUploadsForSubscriptions(env: Env, subscriptions: Subscription[]): Promise<Video[]> {
  const videos: Video[] = [];

  for (const subscription of subscriptions) {
    try {
      videos.push(...(await fetchRecentUploadsForChannel(env, subscription)));
    } catch {
      // TODO: record per-channel polling failures in observability without logging tokens or user data.
    }
  }

  return videos;
}
