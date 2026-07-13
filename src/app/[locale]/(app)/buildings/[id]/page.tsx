import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { NewUnitDialog } from "./new-unit-dialog";
import { EditBuildingDialog } from "./edit-building-dialog";
import { ImportUnitsDialog } from "./import-units-dialog";
import { ImportOwnersDialog } from "./import-owners-dialog";
import { ImportOpeningBalancesDialog } from "./import-opening-balances-dialog";
import { ImportPaymentsDialog } from "./import-payments-dialog";

export default async function BuildingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("units");
  const tInvoices = await getTranslations("invoices");
  const tBuildings = await getTranslations("buildings");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: building } = await supabase
    .from("buildings")
    .select("id, tenant_id, name, address, association_id, associations(name)")
    .eq("id", id)
    .maybeSingle();

  if (!building) {
    notFound();
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, floor, area_sqm, ownership_share_percent, meters")
    .eq("building_id", id)
    .order("unit_number", { ascending: true });

  const shareSum = (units ?? []).reduce(
    (sum, unit) => sum + (unit.ownership_share_percent ?? 0),
    0
  );
  const shareSumRounded = Math.round(shareSum * 1000) / 1000;

  const associationName = building.associations?.[0]?.name ?? tBuildings("title");

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: associationName, href: `/associations/${building.association_id}` },
          { label: building.name },
        ]}
      />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { building: building.name })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditBuildingDialog
            buildingId={building.id}
            defaultValues={{ name: building.name, address: building.address ?? "" }}
          />
          <Button variant="outline" asChild>
            <Link href={`/buildings/${building.id}/invoices`}>{tInvoices("title")}</Link>
          </Button>
          <NewUnitDialog buildingId={building.id} tenantId={building.tenant_id} />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <ImportUnitsDialog buildingId={building.id} tenantId={building.tenant_id} />
        <ImportOwnersDialog buildingId={building.id} tenantId={building.tenant_id} />
        <ImportOpeningBalancesDialog buildingId={building.id} tenantId={building.tenant_id} />
        <ImportPaymentsDialog buildingId={building.id} tenantId={building.tenant_id} />
      </div>

      {units && units.length > 0 && (
        <Alert
          variant={shareSumRounded === 100 ? "default" : "destructive"}
          className="mb-6"
        >
          <AlertTitle>
            {shareSumRounded === 100 ? t("shareSumOk") : t("shareSumWarningTitle")}
          </AlertTitle>
          {shareSumRounded !== 100 && (
            <AlertDescription>
              {t("shareSumWarning", { sum: shareSumRounded })}
            </AlertDescription>
          )}
        </Alert>
      )}

      {!units || units.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("unitNumberLabel")}</TableHead>
              <TableHead>{t("floorLabel")}</TableHead>
              <TableHead>{t("areaLabel")}</TableHead>
              <TableHead>{t("shareLabel")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id} className="relative cursor-pointer">
                <TableCell className="font-medium">{unit.unit_number}</TableCell>
                <TableCell>{unit.floor ?? "—"}</TableCell>
                <TableCell>{unit.area_sqm ?? "—"}</TableCell>
                <TableCell>{unit.ownership_share_percent ?? "—"}</TableCell>
                <TableCell>
                  <Link href={`/units/${unit.id}`} className="absolute inset-0">
                    <span className="sr-only">{t("viewDetails")}</span>
                  </Link>
                  <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
