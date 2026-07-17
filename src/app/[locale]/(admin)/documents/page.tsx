import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { getSignedUrlMap } from "@/lib/storage";
import { formatDate } from "@/lib/period";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { UploadDocumentDialog } from "./upload-document-dialog";
import { DeleteDocumentButton } from "./delete-document-button";

// Association document library, staff side: upload with a visibility
// choice (members-visible documents surface on the resident portal),
// download via signed URLs, delete. RLS scopes rows to what the
// viewer manages or may read.
export default async function DocumentsPage() {
  const t = await getTranslations("documents");
  const supabase = await createClient();

  const context = await getCurrentCapabilities(supabase);
  const canManage = (context?.capabilities ?? []).includes("docs.document.manage");

  const [{ data: associations }, { data: documents }] = await Promise.all([
    supabase.from("associations").select("id, tenant_id, name").order("name"),
    supabase
      .from("documents")
      .select("id, association_id, title, file_name, storage_path, visibility, created_at, associations(name)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const urls = await getSignedUrlMap(
    supabase,
    "documents",
    (documents ?? []).map((d) => d.storage_path)
  );

  const tenantId = (associations ?? [])[0]?.tenant_id;

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {canManage && tenantId && (
          <UploadDocumentDialog
            tenantId={tenantId}
            associations={(associations ?? []).map((a) => ({ id: a.id, name: a.name }))}
          />
        )}
      </div>

      {(documents ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("documentColumn")}</TableHead>
                <TableHead>{t("associationColumn")}</TableHead>
                <TableHead>{t("visibilityLabel")}</TableHead>
                <TableHead>{t("dateColumn")}</TableHead>
                {canManage && <TableHead className="text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(documents ?? []).map((document) => {
                const url = urls.get(document.storage_path);
                return (
                  <TableRow key={document.id}>
                    <TableCell>
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
                        <span className="font-medium">{document.title}</span>
                      )}
                      <p className="text-xs text-muted-foreground">{document.file_name}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {document.associations?.name ?? ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={document.visibility === "members" ? "default" : "secondary"}>
                        {document.visibility === "members"
                          ? t("visibilityMembers")
                          : t("visibilityStaff")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(document.created_at.slice(0, 10))}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <DeleteDocumentButton id={document.id} />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
