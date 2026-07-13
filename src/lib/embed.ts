// Without generated Database types, supabase-js infers every embedded
// relation as an array, even to-one ones (a FK on the queried table
// pointing at the embedded table) -- but PostgREST actually returns
// those as a single object at runtime, never wrapped in an array.
// Indexing such a value with [0] silently reads past the object
// (returns undefined) instead of erroring, so the mismatch has to be
// handled explicitly rather than relying on either shape.
export function embedOne<T>(value: T[] | T | null | undefined): T | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}
