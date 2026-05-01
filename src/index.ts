import { handleGoogleCallback, startGoogleOAuth } from "./auth";
import { latestNotification, registerPushSubscription, sendNewVideoNotification } from "./push";
import { UserScheduler } from "./scheduler";
import type { Env, PushSubscriptionRecord, Subscription, User, Video } from "./types";
import {
  addActiveUser,
  errorResponse,
  getJson,
  getSessionUserId,
  getUser,
  jsonResponse,
  keys,
  makeSessionCookie,
  putJson,
  putUser,
  putVideo,
  readJson,
  videoExists
} from "./utils";
import { fetchRecentUploadsForSubscriptions, fetchSubscriptions, getValidAccessToken } from "./youtube";

export { UserScheduler };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error.message, error.status);
      }

      const message = error instanceof Error ? error.message : "Unexpected error";
      return errorResponse(message, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pollActiveUsers(env));
  }
} satisfies ExportedHandler<Env>;

async function routeRequest(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/auth/login" && request.method === "GET") {
    return startGoogleOAuth(request, env);
  }

  if (url.pathname === "/auth/callback" && request.method === "GET") {
    return handleGoogleCallback(request, env);
  }

  if (url.pathname === "/api/config" && request.method === "GET") {
    return jsonResponse({
      vapidPublicKey: env.VAPID_PUBLIC_KEY ?? "",
      environment: env.ENVIRONMENT ?? "production"
    });
  }

  if (url.pathname === "/api/dev-seed" && request.method === "POST") {
    return seedDevelopmentUser(request, env);
  }

  if (url.pathname.startsWith("/api/")) {
    const user = await requireSessionUser(request, env);

    if (url.pathname === "/api/sync-subscriptions" && request.method === "POST") {
      return syncSubscriptions(env, user);
    }

    if (url.pathname === "/api/channel-state" && request.method === "GET") {
      return schedulerFetch(env, user.id, "/state");
    }

    if (url.pathname === "/api/next" && request.method === "GET") {
      return schedulerFetch(env, user.id, "/next");
    }

    if (url.pathname === "/api/video-ended" && request.method === "POST") {
      return schedulerFetch(env, user.id, "/video-ended", { method: "POST" });
    }

    if (url.pathname === "/api/jump" && request.method === "POST") {
      const body = await readJson<{ videoId?: string }>(request);
      return schedulerFetch(env, user.id, "/jump", {
        method: "POST",
        body: JSON.stringify(body)
      });
    }

    if (url.pathname === "/api/notifications/register" && request.method === "POST") {
      const subscription = await readJson<PushSubscriptionRecord>(request);
      if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
        return errorResponse("Invalid push subscription", 400);
      }

      await registerPushSubscription(env, user.id, subscription);
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/notifications/latest" && request.method === "GET") {
      return jsonResponse(await latestNotification(env, user.id));
    }

    if (url.pathname === "/api/poll-user" && request.method === "POST") {
      const result = await pollUser(env, user.id);
      return jsonResponse(result);
    }

    return errorResponse("Not found", 404);
  }

  return env.ASSETS.fetch(request);
}

async function requireSessionUser(request: Request, env: Env): Promise<User> {
  const userId = await getSessionUserId(request, env);
  if (!userId) {
    throw new ApiError("Not signed in", 401);
  }

  const user = await getUser(env, userId);
  if (!user) {
    throw new ApiError("Session user not found", 401);
  }

  return user;
}

async function syncSubscriptions(env: Env, user: User): Promise<Response> {
  const { user: refreshedUser, accessToken } = await getValidAccessToken(env, user);
  const subscriptions = await fetchSubscriptions(accessToken);
  const now = new Date().toISOString();
  const updatedUser: User = {
    ...refreshedUser,
    subscriptionsSyncedAt: now,
    updatedAt: now
  };

  await putJson(env.USERS_KV, keys.subscriptions(user.id), subscriptions);
  await putUser(env, updatedUser);

  if (env.YOUTUBE_API_KEY) {
    const videos = await fetchRecentUploadsForSubscriptions(env, subscriptions);
    await storeNewVideos(env, user.id, videos, false);
  }

  return schedulerFetch(env, user.id, "/state");
}

async function schedulerFetch(env: Env, userId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const id = env.USER_SCHEDULER.idFromName(userId);
  const stub = env.USER_SCHEDULER.get(id);
  const headers = new Headers(init.headers);
  headers.set("x-user-id", userId);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return stub.fetch(`https://livechannel-scheduler${path}`, { ...init, headers });
}

async function pollActiveUsers(env: Env): Promise<void> {
  const activeUsers = (await getJson<string[]>(env.USERS_KV, keys.activeUsers)) ?? [];
  await Promise.all(activeUsers.slice(0, 50).map((userId) => pollUser(env, userId)));
}

async function pollUser(env: Env, userId: string): Promise<{ newVideos: number; checkedSubscriptions: number }> {
  const subscriptions = (await getJson<Subscription[]>(env.USERS_KV, keys.subscriptions(userId))) ?? [];
  if (!env.YOUTUBE_API_KEY || subscriptions.length === 0) {
    return { newVideos: 0, checkedSubscriptions: subscriptions.length };
  }

  const videos = await fetchRecentUploadsForSubscriptions(env, subscriptions);
  const newVideos = await storeNewVideos(env, userId, videos, true);
  const checkedAt = new Date().toISOString();
  const updatedSubscriptions = subscriptions.map((subscription) => ({ ...subscription, lastCheckedAt: checkedAt }));
  await putJson(env.USERS_KV, keys.subscriptions(userId), updatedSubscriptions);

  return { newVideos, checkedSubscriptions: subscriptions.length };
}

async function storeNewVideos(env: Env, userId: string, videos: Video[], shouldNotify: boolean): Promise<number> {
  let newVideos = 0;

  for (const video of videos) {
    if (await videoExists(env, userId, video.videoId)) continue;
    await putVideo(env, userId, { ...video, detectedAt: video.detectedAt || new Date().toISOString() });
    newVideos += 1;

    if (shouldNotify) {
      await sendNewVideoNotification(env, userId, video);
      await schedulerFetch(env, userId, "/new-video", { method: "POST" });
    }
  }

  return newVideos;
}

async function seedDevelopmentUser(request: Request, env: Env): Promise<Response> {
  if (env.ENVIRONMENT !== "development") {
    return errorResponse("Development seed is disabled", 404);
  }

  const now = new Date();
  const userId = "dev-user";
  const user: User = {
    id: userId,
    googleSub: "dev-google-sub",
    email: "dev@livechannel.local",
    accessToken: "dev-access-token",
    refreshToken: "dev-refresh-token",
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    subscriptionsSyncedAt: now.toISOString()
  };
  const subscriptions: Subscription[] = [
    { channelId: "dev-channel-cloud", title: "Cloud Builders", thumbnailUrl: "", lastCheckedAt: now.toISOString() },
    { channelId: "dev-channel-music", title: "Tiny Concerts", thumbnailUrl: "", lastCheckedAt: now.toISOString() },
    { channelId: "dev-channel-code", title: "Runtime Notes", thumbnailUrl: "", lastCheckedAt: now.toISOString() }
  ];
  const videos = makeSeedVideos(now);

  await putUser(env, user);
  await addActiveUser(env, userId);
  await putJson(env.USERS_KV, keys.subscriptions(userId), subscriptions);
  await Promise.all(videos.map((video) => putVideo(env, userId, video)));
  const stateResponse = await schedulerFetch(env, userId, "/reset", { method: "POST" });
  const state = await stateResponse.json();

  return jsonResponse(
    {
      ok: true,
      userId,
      state
    },
    {
      headers: {
        "set-cookie": await makeSessionCookie(request, env, userId)
      }
    }
  );
}

function makeSeedVideos(now: Date): Video[] {
  const ids = [
    "M7lc1UVf-VE",
    "dQw4w9WgXcQ",
    "jNQXAC9IVRw",
    "kJQP7kiw5Fk",
    "3JZ_D3ELwOQ",
    "L_jWHffIx5E",
    "e-ORhEE9VVg",
    "fJ9rUzIMcZQ",
    "hTWKbfoikeg",
    "Zi_XLOBDo_Y"
  ];
  const channels = [
    { channelId: "dev-channel-cloud", channelTitle: "Cloud Builders" },
    { channelId: "dev-channel-music", channelTitle: "Tiny Concerts" },
    { channelId: "dev-channel-code", channelTitle: "Runtime Notes" }
  ];
  const agesInHours = [1, 3, 12, 30, 40, 55, 72, 96, 120, 168];

  return ids.map((videoId, index) => {
    const channel = channels[index % channels.length];
    const publishedAt = new Date(now.getTime() - agesInHours[index] * 60 * 60 * 1000).toISOString();

    return {
      videoId,
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      title: `${index < 3 ? "Fresh" : "Catch-up"} sample ${index + 1}`,
      description: "Development seed video for the LiveChannel playback loop.",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt,
      detectedAt: now.toISOString()
    };
  });
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
