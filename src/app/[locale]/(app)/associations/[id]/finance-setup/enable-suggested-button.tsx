"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { enableSuggestedFeeType } from "./actions";

export function EnableSuggestedButton({
  tenantId,
  associationId,
  configKey,
  label,
}: {
  tenantId: string;
  associationId: string;
  configKey: string;
  label: string;
}) {
  const t = useTranslations("financeSetup");
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await enableSuggestedFeeType({
      tenantId,
      associationId,
      key: configKey,
      label,
    });
    setPending(false);

    if (result.error) {
      toast.error(t("createError"));
      return;
    }

    toast.success(t("createSuccess"));
  }

  return (
    <Button size="sm" disabled={pending} onClick={handleClick}>
      {t("enable")}
    </Button>
  );
}
