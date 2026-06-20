import type { Env, NewVideoNotificationPayload, PushSubscriptionRecord, Video } from "./types";
import { base64UrlEncode, base64UrlToUint8Array, getJson, keys, putJson } from "./utils";

const encoder = new TextEncoder();

export async function registerPushSubscription(env: Env, userId: string, subscription: PushSubscriptionRecord): Promise<void> {
  const subscriptions = (await getJson<PushSubscriptionRecord[]>(env.PUSH_KV, keys.pushSubscriptions(userId))) ?? [];
  const now = new Date().toISOString();
  const nextSubscriptions = [
    ...subscriptions.filter((candidate) => candidate.endpoint !== subscription.endpoint),
    {
      ...subscription,
      createdAt: subscription.createdAt || now,
      updatedAt: now
    }
  ];

  await putJson(env.PUSH_KV, keys.pushSubscriptions(userId), nextSubscriptions);
}

export async function sendNewVideoNotification(env: Env, userId: string, video: Video): Promise<void> {
  const payload: NewVideoNotificationPayload = {
    videoId: video.videoId,
    title: video.title,
    channelTitle: video.channelTitle,
    url: `/?jumpVideoId=${encodeURIComponent(video.videoId)}`
  };

  await putJson(env.PUSH_KV, keys.latestNotification(userId), payload, { expirationTtl: 60 * 60 * 24 });

  const subscriptions = (await getJson<PushSubscriptionRecord[]>(env.PUSH_KV, keys.pushSubscriptions(userId))) ?? [];
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || subscriptions.length === 0) return;

  const liveSubscriptions: PushSubscriptionRecord[] = [];

  for (const subscription of subscriptions) {
    try {
      const response = await sendEmptyWebPush(env, subscription);
      if (response.status !== 404 && response.status !== 410) {
        liveSubscriptions.push(subscription);
      }
    } catch {
      liveSubscriptions.push(subscription);
      // TODO: add retry metrics. Avoid logging endpoints because push URLs are bearer credentials.
    }
  }

  await putJson(env.PUSH_KV, keys.pushSubscriptions(userId), liveSubscriptions);
}

export async function latestNotification(env: Env, userId: string): Promise<NewVideoNotificationPayload | null> {
  return getJson<NewVideoNotificationPayload>(env.PUSH_KV, keys.latestNotification(userId));
}

async function sendEmptyWebPush(env: Env, subscription: PushSubscriptionRecord): Promise<Response> {
  const vapidJwt = await createVapidJwt(env, subscription.endpoint);

  // Payload encryption is intentionally deferred for v1. The service worker fetches the
  // pending same-origin notification payload after this signed wake-up push arrives.
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: "300",
      Urgency: "normal",
      Authorization: `vapid t=${vapidJwt}, k=${env.VAPID_PUBLIC_KEY}`
    }
  });
}

async function createVapidJwt(env: Env, endpoint: string): Promise<string> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error("VAPID keys are not configured");
  }

  const publicKeyBytes = base64UrlToUint8Array(env.VAPID_PUBLIC_KEY);
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 point");
  }

  const x = base64UrlEncode(publicKeyBytes.slice(1, 33));
  const y = base64UrlEncode(publicKeyBytes.slice(33, 65));
  const d = base64UrlEncode(base64UrlToUint8Array(env.VAPID_PRIVATE_KEY));
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: false },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: "mailto:notifications@driftyt.example"
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput));
  const joseSignature = ecdsaSignatureToJose(new Uint8Array(signature));

  return `${signingInput}.${base64UrlEncode(joseSignature)}`;
}

function ecdsaSignatureToJose(signature: Uint8Array): Uint8Array {
  if (signature.byteLength === 64) return signature;
  if (signature[0] !== 0x30) return signature;

  let offset = 2;
  if (signature[1] & 0x80) {
    offset = 2 + (signature[1] & 0x7f);
  }

  if (signature[offset] !== 0x02) return signature;
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;

  if (signature[offset] !== 0x02) return signature;
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);

  return concatFixedInteger(r, s);
}

function concatFixedInteger(r: Uint8Array, s: Uint8Array): Uint8Array {
  const output = new Uint8Array(64);
  output.set(trimAndPad(r), 0);
  output.set(trimAndPad(s), 32);
  return output;
}

function trimAndPad(value: Uint8Array): Uint8Array {
  const trimmed = value[0] === 0 ? value.slice(1) : value;
  const output = new Uint8Array(32);
  output.set(trimmed.slice(-32), 32 - Math.min(trimmed.length, 32));
  return output;
}
