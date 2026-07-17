"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  tenantId: z.string().uuid(),
  associationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  storagePath: z.string().trim().min(1),
  mimeType: z.string().trim().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  visibility: z.enum(["members", "staff"]),
});

// Registers metadata for a file the browser already uploaded (the
// storage INSERT policy verified docs.document.manage for the
// association folder; the documents_insert RLS policy re-checks it
// here). The path must live under this association's folder so a
// metadata row can't point at someone else's upload.
export async function createDocument(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);

  if (!parsed.storagePath.startsWith(`${parsed.associationId}/`)) {
    return { error: "Storage path outside the association folder" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase.from("documents").insert({
    tenant_id: parsed.tenantId,
    association_id: parsed.associationId,
    title: parsed.title,
    file_name: parsed.fileName,
    storage_path: parsed.storagePath,
    mime_type: parsed.mimeType || null,
    size_bytes: parsed.sizeBytes ?? null,
    visibility: parsed.visibility,
    uploaded_by: user.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

// Removes the storage object first (policy: docs.document.manage via
// the association folder), then the metadata row. If the object
// removal fails the row stays, so the library never lists dead links.
export async function deleteDocument(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();

  const { data: document } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!document) {
    return { error: "Document not found" };
  }

  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([document.storage_path]);
  if (storageError) {
    return { error: storageError.message };
  }

  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
