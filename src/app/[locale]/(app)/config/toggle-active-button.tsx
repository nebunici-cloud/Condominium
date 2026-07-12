"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { toggleConfigEntryActive } from "./actions";

export function ToggleActiveButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const t = useTranslations("config");
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const result = await toggleConfigEntryActive(id, !isActive);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={handleClick}>
      {isActive ? t("deactivate") : t("activate")}
    </Button>
  );
}
