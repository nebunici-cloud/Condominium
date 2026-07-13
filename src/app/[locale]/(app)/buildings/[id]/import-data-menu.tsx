"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ImportUnitsDialog } from "./import-units-dialog";
import { ImportOwnersDialog } from "./import-owners-dialog";
import { ImportOpeningBalancesDialog } from "./import-opening-balances-dialog";
import { ImportPaymentsDialog } from "./import-payments-dialog";

type ActiveImport = "units" | "owners" | "balances" | "payments" | null;

export function ImportDataMenu({
  buildingId,
  tenantId,
  capabilities,
}: {
  buildingId: string;
  tenantId: string;
  capabilities: string[];
}) {
  const tCommon = useTranslations("common");
  const tUnits = useTranslations("units");
  const tOwners = useTranslations("owners");
  const tBalances = useTranslations("openingBalances");
  const tPayments = useTranslations("payments");
  const [active, setActive] = useState<ActiveImport>(null);

  const canImportUnits = capabilities.includes("core.unit.create");
  const canImportOwners =
    capabilities.includes("core.owner.create") && capabilities.includes("core.ownership.create");
  const canImportBalances = capabilities.includes("finance.opening_balance.import");
  const canImportPayments = capabilities.includes("finance.payment.record");

  if (!canImportUnits && !canImportOwners && !canImportBalances && !canImportPayments) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <UploadIcon />
            {tCommon("importData")}
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {canImportUnits && (
            <DropdownMenuItem onSelect={() => setActive("units")}>
              {tUnits("importTitle")}
            </DropdownMenuItem>
          )}
          {canImportOwners && (
            <DropdownMenuItem onSelect={() => setActive("owners")}>
              {tOwners("importTitle")}
            </DropdownMenuItem>
          )}
          {canImportBalances && (
            <DropdownMenuItem onSelect={() => setActive("balances")}>
              {tBalances("importTitle")}
            </DropdownMenuItem>
          )}
          {canImportPayments && (
            <DropdownMenuItem onSelect={() => setActive("payments")}>
              {tPayments("importTitle")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canImportUnits && (
        <ImportUnitsDialog
          buildingId={buildingId}
          tenantId={tenantId}
          open={active === "units"}
          onOpenChange={(open) => setActive(open ? "units" : null)}
        />
      )}
      {canImportOwners && (
        <ImportOwnersDialog
          buildingId={buildingId}
          tenantId={tenantId}
          open={active === "owners"}
          onOpenChange={(open) => setActive(open ? "owners" : null)}
        />
      )}
      {canImportBalances && (
        <ImportOpeningBalancesDialog
          buildingId={buildingId}
          tenantId={tenantId}
          open={active === "balances"}
          onOpenChange={(open) => setActive(open ? "balances" : null)}
        />
      )}
      {canImportPayments && (
        <ImportPaymentsDialog
          buildingId={buildingId}
          tenantId={tenantId}
          open={active === "payments"}
          onOpenChange={(open) => setActive(open ? "payments" : null)}
        />
      )}
    </>
  );
}
