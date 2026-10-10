import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk";

// Forwards /api/* to the Node.js server, so the browser only talks to this origin and
// SERVER_URL can be set at runtime (e.g. http://server:4000 inside Docker). The
// signed-in user's Clerk session token is passed on for the server to verify.
const serverUrl = () => process.env.SERVER_URL || "http://localhost:4000";

// Hop-by-hop and length headers are recomputed by the runtime. Browser cookies and
// auth headers are not passed on: the server only trusts the token added below.
const SKIP_REQUEST = new Set(["host", "connection", "content-length", "accept-encoding", "cookie", "authorization"]);
const PASS_RESPONSE = ["content-type", "cache-control", "location", "content-disposition", "etag", "last-modified"];

async function forward(request: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const search = new URL(request.url).search;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!SKIP_REQUEST.has(key)) headers.set(key, value);
  });
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  if (clerkEnabled) {
    const token = await (await auth()).getToken().catch(() => null);
    if (token) headers.set("authorization", `Bearer ${token}`);
  }

  try {
    const upstream = await fetch(`${serverUrl()}/api/${path.join("/")}${search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
      signal: request.signal,
    });
    const out = new Headers();
    for (const name of PASS_RESPONSE) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    if (out.get("content-type")?.startsWith("text/event-stream")) {
      out.set("cache-control", "no-cache, no-transform");
      out.set("x-accel-buffering", "no");
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ error: "F1 server is unreachable" }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
