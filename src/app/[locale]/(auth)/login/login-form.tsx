"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { DevLoginPanel } from "./dev-login-panel";

export function LoginForm({ devLoginEnabled }: { devLoginEnabled: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
      },
    });

    if (error) {
      const isRateLimited = error.status === 429 || error.code === "over_email_send_rate_limit";
      if (isRateLimited) {
        toast.error(t("magicLinkRateLimited"));
      } else {
        toast.error(t("magicLinkError"), { description: error.message });
      }
      setStatus("idle");
      return;
    }

    setStatus("sent");
    toast.success(t("magicLinkSent"));
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "sent" ? (
        <p className="text-sm text-muted-foreground">{t("magicLinkSent")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={status === "sending"}>
            {status === "sending" ? t("signingIn") : t("sendMagicLink")}
          </Button>
        </form>
      )}

      <div className="flex items-center gap-2">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">{t("orContinueWith")}</span>
        <Separator className="flex-1" />
      </div>

      <Button variant="outline" disabled>
        {t("googleComingSoon")}
      </Button>
      <Button variant="outline" disabled>
        {t("facebookComingSoon")}
      </Button>

      {devLoginEnabled && (
        <>
          <Separator />
          <DevLoginPanel />
        </>
      )}
    </div>
  );
}
