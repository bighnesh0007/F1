// Forwards /api/* to the Node.js server, so the browser only talks to this origin
// and SERVER_URL can be set at runtime (e.g. http://server:4000 inside Docker).
const serverUrl = () => process.env.SERVER_URL || "http://localhost:4000";

export async function GET(request: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const search = new URL(request.url).search;
  try {
    const upstream = await fetch(`${serverUrl()}/api/${path.join("/")}${search}`, {
      cache: "no-store",
      signal: request.signal,
    });
    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
    });
    if (headers.get("Content-Type")?.startsWith("text/event-stream")) {
      headers.set("X-Accel-Buffering", "no");
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ error: "F1 server is unreachable" }, { status: 502 });
  }
}
