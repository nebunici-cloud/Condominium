import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Batch-mints signed URLs for private-bucket objects under the
// caller's own session, so storage RLS decides what resolves. Paths
// the caller may not read simply come back without a URL.
export async function getSignedUrlMap(
  supabase: SupabaseServerClient,
  bucket: string,
  paths: string[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths)).filter(Boolean);
  if (unique.length === 0) return map;

  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresInSeconds);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      map.set(entry.path, entry.signedUrl);
    }
  }
  return map;
}

// Storage object keys must stay ASCII-safe; keep letters, digits,
// dots, dashes; everything else becomes an underscore.
export function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(-120);
  const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return sanitized || "file";
}
