import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentCapabilities } from "@/lib/capabilities";
import { formatDate } from "@/lib/period";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { NewAnnouncementDialog } from "./new-announcement-dialog";
import { DeleteAnnouncementButton } from "./delete-announcement-button";

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("announcements");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: association } = await supabase
    .from("associations")
    .select("id, tenant_id, name")
    .eq("id", id)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const context = await getCurrentCapabilities(supabase, association.id);
  const canManage = (context?.capabilities ?? []).includes("comms.announcement.manage");

  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, published_at")
    .eq("association_id", association.id)
    .order("published_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: association.name, href: `/associations/${association.id}` },
          { label: t("title") },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canManage && (
          <NewAnnouncementDialog tenantId={association.tenant_id} associationId={association.id} />
        )}
      </div>

      {(announcements ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {(announcements ?? []).map((announcement) => (
            <Card key={announcement.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{announcement.title}</CardTitle>
                    <CardDescription>
                      {formatDate(announcement.published_at.slice(0, 10))}
                    </CardDescription>
                  </div>
                  {canManage && <DeleteAnnouncementButton id={announcement.id} />}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{announcement.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
