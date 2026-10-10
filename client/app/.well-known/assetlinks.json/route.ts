// Digital Asset Links for publishing F1 Live to Google Play as a Trusted Web Activity
// (an Android app wrapper around this site, e.g. built with Bubblewrap or PWABuilder).
// Set ANDROID_PACKAGE_NAME and ANDROID_CERT_SHA256 (comma-separated fingerprints).
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = pkg && fingerprints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints } }]
    : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
