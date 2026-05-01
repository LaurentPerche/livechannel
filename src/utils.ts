import type { Env, User, Video } from "./types";

const encoder = new TextEncoder();

export const keys = {
  activeUsers: "active-users",
  user: (userId: string) => `user:${userId}`,
  userByGoogleSub: (googleSub: string) => `google-sub:${googleSub}`,
  subscriptions: (userId: string) => `subscriptions:${userId}`,
  video: (userId: string, videoId: string) => `video:${userId}:${videoId}`,
  videoPrefix: (userId: string) => `video:${userId}:`,
  channelUploadsPlaylist: (channelId: string) => `channel:${channelId}:uploads-playlist`,
  channelRecentUploads: (channelId: string) => `channel:${channelId}:recent-uploads`,
  pushSubscriptions: (userId: string) => `push:${userId}:subscriptions`,
  latestNotification: (userId: string) => `push:${userId}:latest`
};

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export async function getJson<T>(kv: KVNamespace, key: string): Promise<T | null> {
  return kv.get<T>(key, "json");
}

export async function putJson(kv: KVNamespace, key: string, value: unknown, options?: KVNamespacePutOptions): Promise<void> {
  await kv.put(key, JSON.stringify(value), options);
}

export async function listJsonByPrefix<T>(kv: KVNamespace, prefix: string): Promise<T[]> {
  const values: T[] = [];
  let cursor: string | undefined;

  do {
    const listed = await kv.list({ prefix, cursor });
    cursor = listed.list_complete ? undefined : listed.cursor;

    await Promise.all(
      listed.keys.map(async (entry) => {
        const value = await kv.get<T>(entry.name, "json");
        if (value) values.push(value);
      })
    );
  } while (cursor);

  return values;
}

export function toVideoSummary(video: Video) {
  return {
    videoId: video.videoId,
    title: video.title,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    thumbnailUrl: video.thumbnailUrl
  };
}

export function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }

  return null;
}

export function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? encoder.encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function randomToken(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(signature);
}

export function getSessionSecret(env: Env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (env.ENVIRONMENT === "development") return "livechannel-development-session-secret";
  throw new Error("SESSION_SECRET is not configured");
}

export async function signValue(env: Env, value: string): Promise<string> {
  const signature = await hmac(getSessionSecret(env), value);
  return `${value}.${signature}`;
}

export async function verifySignedValue(env: Env, signedValue: string | null): Promise<string | null> {
  if (!signedValue) return null;
  const separator = signedValue.lastIndexOf(".");
  if (separator <= 0) return null;

  const value = signedValue.slice(0, separator);
  const signature = signedValue.slice(separator + 1);
  const expected = await hmac(getSessionSecret(env), value);

  return signature === expected ? value : null;
}

export async function getSessionUserId(request: Request, env: Env): Promise<string | null> {
  return verifySignedValue(env, readCookie(request, "lc_session"));
}

export async function makeSessionCookie(request: Request, env: Env, userId: string): Promise<string> {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const signed = await signValue(env, userId);
  return `lc_session=${signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export async function makeOAuthStateCookie(request: Request, env: Env, state: string): Promise<string> {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const signed = await signValue(env, state);
  return `lc_oauth_state=${signed}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
}

export function clearOAuthStateCookie(request: Request): string {
  const url = new URL(request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `lc_oauth_state=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function addActiveUser(env: Env, userId: string): Promise<void> {
  const activeUsers = (await getJson<string[]>(env.USERS_KV, keys.activeUsers)) ?? [];
  if (!activeUsers.includes(userId)) {
    activeUsers.push(userId);
    await putJson(env.USERS_KV, keys.activeUsers, activeUsers);
  }
}

export async function getUser(env: Env, userId: string): Promise<User | null> {
  return getJson<User>(env.USERS_KV, keys.user(userId));
}

export async function putUser(env: Env, user: User): Promise<void> {
  await putJson(env.USERS_KV, keys.user(user.id), user);
  await putJson(env.USERS_KV, keys.userByGoogleSub(user.googleSub), user.id);
  await addActiveUser(env, user.id);
}

export async function putVideo(env: Env, userId: string, video: Video): Promise<void> {
  await putJson(env.VIDEOS_KV, keys.video(userId, video.videoId), video);
}

export async function videoExists(env: Env, userId: string, videoId: string): Promise<boolean> {
  return (await env.VIDEOS_KV.get(keys.video(userId, videoId))) !== null;
}

export function requireConfigured(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
