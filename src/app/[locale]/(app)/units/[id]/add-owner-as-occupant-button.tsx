"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { addOwnerAsOccupant } from "./actions";

export function AddOwnerAsOccupantButton({
  unitId,
  tenantId,
  ownerId,
}: {
  unitId: string;
  tenantId: string;
  ownerId: string;
}) {
  const t = useTranslations("ownerships");
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    const result = await addOwnerAsOccupant({ unitId, tenantId, ownerId });
    setSubmitting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(t("ownerLivesHereSuccess"));
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleClick} disabled={submitting}>
      {t("ownerLivesHere")}
    </Button>
  );
}
