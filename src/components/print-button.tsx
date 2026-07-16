"use client";

import { useTranslations } from "next-intl";
import { PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

// The browser's print dialog doubles as "save as PDF" everywhere, so
// this is the v1 export path for invoices. print:hidden keeps the
// button itself off the printed page.
export function PrintButton() {
  const t = useTranslations("common");

  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <PrinterIcon />
      {t("print")}
    </Button>
  );
}
