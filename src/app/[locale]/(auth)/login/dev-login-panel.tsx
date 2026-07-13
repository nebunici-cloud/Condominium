"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { devLoginAsRole } from "./dev-login-actions";

const DEV_ROLE_CODES = [
  "administrator",
  "board_president",
  "accountant",
  "council_member",
  "owner",
  "occupant_tenant",
] as const;

export function DevLoginPanel() {
  const t = useTranslations("auth");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
  const [roleCode, setRoleCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleDevLogin() {
    if (!roleCode) return;
    setSubmitting(true);
    const result = await devLoginAsRole(roleCode, locale, window.location.origin);

    if (result.error || !result.url) {
      setSubmitting(false);
      toast.error(result.error ?? t("devLoginError"));
      return;
    }

    window.location.href = result.url;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">{t("devLoginTitle")}</p>
      <div className="flex gap-2">
        <Select value={roleCode} onValueChange={setRoleCode}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("devLoginRolePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {DEV_ROLE_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {tRoles.has(code) ? tRoles(code) : code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={handleDevLogin}
          disabled={!roleCode || submitting}
        >
          {submitting ? t("signingIn") : t("devLoginButton")}
        </Button>
      </div>
    </div>
  );
}
