"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const tAssoc = useTranslations("associations");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("bootstrap_tenant", {
      p_tenant_name: name,
    });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    toast.success(t("welcomeTitle"));
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("welcomeTitle")}</CardTitle>
          <CardDescription>{t("welcomeBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tenant-name">{tAssoc("nameLabel")}</Label>
              <Input
                id="tenant-name"
                required
                placeholder={tAssoc("namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("settingUp") : tCommon("create")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
