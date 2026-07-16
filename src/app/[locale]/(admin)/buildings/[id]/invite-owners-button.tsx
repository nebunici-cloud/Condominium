"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { inviteBuildingOwners } from "./invite-owners-actions";

export function InviteOwnersButton({ buildingId }: { buildingId: string }) {
  const t = useTranslations("buildings");
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    const result = await inviteBuildingOwners(buildingId);
    setSubmitting(false);

    if (result.error) {
      toast.error(t("inviteOwnersError"), { description: result.error });
      return;
    }
    if (result.invited === 0 && result.skipped === 0) {
      toast.info(t("inviteOwnersNone"));
      return;
    }
    toast.success(t("inviteOwnersSuccess", { invited: result.invited, skipped: result.skipped }));
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={submitting}>
      <MailPlusIcon />
      {t("inviteOwners")}
    </Button>
  );
}
