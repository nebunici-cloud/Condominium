"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, MailPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inviteOwner } from "@/app/[locale]/(admin)/owners/actions";

// Whether an owner can use the resident portal, shown wherever the
// owner appears (unit page, directory):
//   active      -- their owner record is linked to a login
//   invited     -- a pending invite exists for their email
//   not_invited -- has an email but nobody invited them yet
//   no_email    -- can't be invited until an email is on file
//   unknown     -- viewer can't read invites, so don't guess
export type OwnerAccessStatus = "active" | "invited" | "not_invited" | "no_email" | "unknown";

export function OwnerAccessCell({
  ownerId,
  email,
  status,
  canInvite,
}: {
  ownerId: string;
  email: string | null;
  status: OwnerAccessStatus;
  canInvite: boolean;
}) {
  const t = useTranslations("owners");
  const [currentStatus, setCurrentStatus] = useState(status);
  const [inviting, setInviting] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleInvite() {
    setInviting(true);
    const result = await inviteOwner(ownerId);
    setInviting(false);

    if (result.error) {
      const message =
        result.error === "no_email"
          ? t("accessNoEmail")
          : result.error === "already_linked"
            ? t("accessActive")
            : result.error;
      toast.error(message);
      return;
    }
    setCurrentStatus("invited");
    setSentOpen(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(window.location.origin);
    }
  }

  const badge =
    currentStatus === "active" ? (
      <Badge className="border-transparent bg-emerald-500 text-white">{t("accessActive")}</Badge>
    ) : currentStatus === "invited" ? (
      <Badge className="border-transparent bg-sky-600 text-white">{t("accessInvited")}</Badge>
    ) : currentStatus === "not_invited" ? (
      <Badge variant="secondary">{t("accessNotInvited")}</Badge>
    ) : currentStatus === "no_email" ? (
      <Badge variant="outline">{t("accessNoEmail")}</Badge>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const showInvite =
    canInvite && (currentStatus === "not_invited" || currentStatus === "invited");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {badge}
      {showInvite && (
        <Button variant="outline" size="sm" disabled={inviting} onClick={handleInvite}>
          <MailPlusIcon className="size-4" />
          {currentStatus === "invited" ? t("reinviteAction") : t("inviteAction")}
        </Button>
      )}

      <Dialog open={sentOpen} onOpenChange={setSentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inviteSentTitle")}</DialogTitle>
            <DialogDescription>
              {t("inviteSentHint", { email: email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {typeof window !== "undefined" ? window.location.origin : ""}
            </code>
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              {copied ? t("linkCopied") : t("copyLink")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
