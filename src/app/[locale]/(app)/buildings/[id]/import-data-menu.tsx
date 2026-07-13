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
}: {
  buildingId: string;
  tenantId: string;
}) {
  const tCommon = useTranslations("common");
  const tUnits = useTranslations("units");
  const tOwners = useTranslations("owners");
  const tBalances = useTranslations("openingBalances");
  const tPayments = useTranslations("payments");
  const [active, setActive] = useState<ActiveImport>(null);

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
          <DropdownMenuItem onSelect={() => setActive("units")}>
            {tUnits("importTitle")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActive("owners")}>
            {tOwners("importTitle")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActive("balances")}>
            {tBalances("importTitle")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setActive("payments")}>
            {tPayments("importTitle")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportUnitsDialog
        buildingId={buildingId}
        tenantId={tenantId}
        open={active === "units"}
        onOpenChange={(open) => setActive(open ? "units" : null)}
      />
      <ImportOwnersDialog
        buildingId={buildingId}
        tenantId={tenantId}
        open={active === "owners"}
        onOpenChange={(open) => setActive(open ? "owners" : null)}
      />
      <ImportOpeningBalancesDialog
        buildingId={buildingId}
        tenantId={tenantId}
        open={active === "balances"}
        onOpenChange={(open) => setActive(open ? "balances" : null)}
      />
      <ImportPaymentsDialog
        buildingId={buildingId}
        tenantId={tenantId}
        open={active === "payments"}
        onOpenChange={(open) => setActive(open ? "payments" : null)}
      />
    </>
  );
}
