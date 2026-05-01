import type { Env, User } from "./types";
import { exchangeCodeForTokens, fetchUserProfile } from "./youtube";
import {
  clearOAuthStateCookie,
  getJson,
  keys,
  makeOAuthStateCookie,
  makeSessionCookie,
  putUser,
  randomToken,
  readCookie,
  requireConfigured,
  verifySignedValue
} from "./utils";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube.readonly"
];

export async function startGoogleOAuth(request: Request, env: Env): Promise<Response> {
  const state = randomToken();
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", requireConfigured(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"));
  authUrl.searchParams.set("redirect_uri", requireConfigured(env.GOOGLE_REDIRECT_URI, "GOOGLE_REDIRECT_URI"));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return new Response(null, {
    status: 302,
    headers: {
      location: authUrl.toString(),
      "set-cookie": await makeOAuthStateCookie(request, env, state)
    }
  });
}

export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const expectedState = await verifySignedValue(env, readCookie(request, "lc_oauth_state"));

  if (!code || !returnedState || returnedState !== expectedState) {
    return new Response("Invalid OAuth state", {
      status: 400,
      headers: { "set-cookie": clearOAuthStateCookie(request) }
    });
  }

  const tokens = await exchangeCodeForTokens(env, code);
  const profile = await fetchUserProfile(tokens.access_token);
  const existingUserId = await getJson<string>(env.USERS_KV, keys.userByGoogleSub(profile.sub));
  const existingUser = existingUserId ? await getJson<User>(env.USERS_KV, keys.user(existingUserId)) : null;
  const now = new Date().toISOString();
  const user: User = {
    id: existingUser?.id ?? crypto.randomUUID(),
    googleSub: profile.sub,
    email: profile.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? existingUser?.refreshToken ?? "",
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    createdAt: existingUser?.createdAt ?? now,
    updatedAt: now,
    subscriptionsSyncedAt: existingUser?.subscriptionsSyncedAt
  };

  await putUser(env, user);

  return new Response(null, {
    status: 302,
    headers: [
      ["location", "/"],
      ["set-cookie", await makeSessionCookie(request, env, user.id)],
      ["set-cookie", clearOAuthStateCookie(request)]
    ]
  });
}
