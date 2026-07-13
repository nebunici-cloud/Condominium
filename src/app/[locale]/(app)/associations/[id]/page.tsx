import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";

import { NewBuildingDialog } from "./new-building-dialog";
import { EditAssociationDialog } from "./edit-association-dialog";

export default async function AssociationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("buildings");
  const tUnits = await getTranslations("units");
  const tFinance = await getTranslations("financeSetup");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: association } = await supabase
    .from("associations")
    .select("id, tenant_id, name, legal_id, address")
    .eq("id", id)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name, address, created_at, units(count)")
    .eq("association_id", id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl p-8">
      <BackLink href="/associations" label={tAssociations("title")} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { association: association.name })}
          </p>
        </div>
        <div className="flex gap-2">
          <EditAssociationDialog
            associationId={association.id}
            defaultValues={{
              name: association.name,
              legalId: association.legal_id ?? "",
              address: association.address ?? "",
            }}
          />
          <Button variant="outline" asChild>
            <Link href={`/associations/${association.id}/finance-setup`}>
              {tFinance("title")}
            </Link>
          </Button>
          <NewBuildingDialog associationId={association.id} tenantId={association.tenant_id} />
        </div>
      </div>

      {!buildings || buildings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noBuildings")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nameLabel")}</TableHead>
              <TableHead>{t("addressLabel")}</TableHead>
              <TableHead>{tUnits("title")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {buildings.map((building) => (
              <TableRow key={building.id}>
                <TableCell className="font-medium">{building.name}</TableCell>
                <TableCell>{building.address ?? "—"}</TableCell>
                <TableCell>
                  {t("unitsCount", { count: building.units?.[0]?.count ?? 0 })}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/buildings/${building.id}`}>{t("viewDetails")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
