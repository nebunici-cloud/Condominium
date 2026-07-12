import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { EndEffectiveDatedButton } from "@/components/end-effective-dated-button";

import { NewOwnershipDialog } from "./new-ownership-dialog";
import { NewOccupancyDialog } from "./new-occupancy-dialog";
import { endOwnership, endOccupancy } from "./actions";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("units");
  const tOwnerships = await getTranslations("ownerships");
  const tOccupancies = await getTranslations("occupancies");
  const tCommon = await getTranslations("common");
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select("id, tenant_id, unit_number")
    .eq("id", id)
    .maybeSingle();

  if (!unit) {
    notFound();
  }

  const [{ data: ownerships }, { data: occupancies }, { data: owners }] =
    await Promise.all([
      supabase
        .from("ownerships")
        .select("id, share_percent, effective_from, effective_to, owners(full_name)")
        .eq("unit_id", id)
        .order("effective_from", { ascending: false }),
      supabase
        .from("occupancies")
        .select("id, effective_from, effective_to, occupants(full_name)")
        .eq("unit_id", id)
        .order("effective_from", { ascending: false }),
      supabase
        .from("owners")
        .select("id, full_name")
        .order("full_name", { ascending: true }),
    ]);

  const currentShareSum = (ownerships ?? [])
    .filter((o) => !o.effective_to)
    .reduce((sum, o) => sum + o.share_percent, 0);
  const currentShareSumRounded = Math.round(currentShareSum * 1000) / 1000;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">
        {t("title")} — {unit.unit_number}
      </h1>

      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{tOwnerships("title")}</h2>
          <NewOwnershipDialog
            unitId={unit.id}
            tenantId={unit.tenant_id}
            owners={owners ?? []}
          />
        </div>

        {ownerships && ownerships.some((o) => !o.effective_to) && (
          <Alert
            variant={currentShareSumRounded === 100 ? "default" : "destructive"}
            className="mb-4"
          >
            <AlertTitle>
              {currentShareSumRounded === 100
                ? tOwnerships("shareSumOk")
                : tOwnerships("shareSumWarning", { sum: currentShareSumRounded })}
            </AlertTitle>
          </Alert>
        )}

        {!ownerships || ownerships.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOwnerships("noOwnerships")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tOwnerships("ownerLabel")}</TableHead>
                <TableHead>{tOwnerships("sharePercentLabel")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerships.map((ownership) => {
                const isCurrent = !ownership.effective_to;
                return (
                  <TableRow key={ownership.id}>
                    <TableCell className="font-medium">
                      {ownership.owners?.[0]?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>{ownership.share_percent}%</TableCell>
                    <TableCell>
                      <Badge variant={isCurrent ? "default" : "secondary"}>
                        {isCurrent ? tOwnerships("current") : tOwnerships("historical")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isCurrent && (
                        <EndEffectiveDatedButton
                          id={ownership.id}
                          action={endOwnership}
                          triggerLabel={tOwnerships("endOwnership")}
                          confirmTitle={tOwnerships("endOwnership")}
                          confirmDescription={tOwnerships("endOwnershipConfirm")}
                          successMessage={tOwnerships("endSuccess")}
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{tOccupancies("title")}</h2>
          <NewOccupancyDialog unitId={unit.id} tenantId={unit.tenant_id} />
        </div>

        {!occupancies || occupancies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOccupancies("noOccupancies")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tOccupancies("fullNameLabel")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {occupancies.map((occupancy) => {
                const isCurrent = !occupancy.effective_to;
                return (
                  <TableRow key={occupancy.id}>
                    <TableCell className="font-medium">
                      {occupancy.occupants?.[0]?.full_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isCurrent ? "default" : "secondary"}>
                        {isCurrent
                          ? tOwnerships("current")
                          : tOwnerships("historical")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isCurrent && (
                        <EndEffectiveDatedButton
                          id={occupancy.id}
                          action={endOccupancy}
                          triggerLabel={tOccupancies("endOccupancy")}
                          confirmTitle={tOccupancies("endOccupancy")}
                          confirmDescription={tOccupancies("endOccupancyConfirm")}
                          successMessage={tOccupancies("endSuccess")}
                          cancelLabel={tCommon("cancel")}
                          confirmLabel={tCommon("confirm")}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
