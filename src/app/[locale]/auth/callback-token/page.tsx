"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

// Destination for admin-generated sign-in links (dev login), which
// return session tokens in the URL hash fragment (implicit flow)
// instead of a ?code= query param (PKCE) -- a server-side admin call
// has no client session to attach a PKCE code_verifier to, so it can
// only ever produce this style of link. Fragments never reach the
// server, so this has to be completed client-side, unlike the normal
// /auth/callback route handler that real emailed magic links use.
export default function CallbackTokenPage() {
  const t = useTranslations("auth");
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        router.replace(error ? "/login" : "/");
        router.refresh();
      });
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">{t("callbackProcessing")}</p>
    </main>
  );
}
