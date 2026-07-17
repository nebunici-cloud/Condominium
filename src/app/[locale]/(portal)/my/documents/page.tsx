import { getTranslations } from "next-intl/server";
import { FileTextIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/storage";
import { formatDate } from "@/lib/period";

// Resident-facing document library: members-visible documents of the
// resident's associations (RLS enforces both the visibility flag and
// tenant membership). Downloads are short-lived signed URLs.
export default async function MyDocumentsPage() {
  const t = await getTranslations("documents");
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, file_name, storage_path, created_at, associations(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const urls = await getSignedUrlMap(
    supabase,
    "documents",
    (documents ?? []).map((d) => d.storage_path)
  );

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold">{t("myTitle")}</h1>

      {(documents ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("myEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(documents ?? []).map((document) => {
            const url = urls.get(document.storage_path);
            return (
              <li key={document.id} className="rounded-md border p-4">
                <div className="flex items-start gap-3">
                  <FileTextIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {document.title}
                      </a>
                    ) : (
                      <p className="font-medium">{document.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {[document.associations?.name, formatDate(document.created_at.slice(0, 10))]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
