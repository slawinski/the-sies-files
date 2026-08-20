// Session cookie names + options. Storyteller and player auth boundaries are
// distinct (docs/01 §18). Both cookies are HttpOnly so JS never reads the raw
// token. In production the `__Host-` prefix enforces Secure + host-only + Path=/
// (defends against subdomain cookie injection); local/dev uses plain names over
// http.

const SECURE = process.env.NODE_ENV === "production";
const PREFIX = SECURE ? "__Host-" : "";

export const COOKIE_PLAYER_SESSION = `${PREFIX}sie_p_st`;
export const COOKIE_STORYTELLER_SESSION = `${PREFIX}sie_st`;

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function cookieOptions(sameSite: "lax" | "strict") {
  return {
    httpOnly: true,
    sameSite,
    secure: SECURE,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  } as const;
}

export const PLAYER_SESSION_COOKIE_OPTIONS = cookieOptions("lax");
export const STORYTELLER_SESSION_COOKIE_OPTIONS = cookieOptions("strict");
