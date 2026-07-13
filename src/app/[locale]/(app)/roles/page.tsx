import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { embedOne } from "@/lib/embed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function RolesPage() {
  const t = await getTranslations("roles");
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("roles")
    .select("id, code, name, role_capabilities(capabilities(code, description))")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!roles || roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCapabilities")}</p>
      ) : (
        <div className="grid gap-4">
          {roles.map((role) => {
            const capabilities = role.role_capabilities
              .map((rc) => embedOne(rc.capabilities))
              .filter((c): c is { code: string; description: string } => Boolean(c));

            return (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle>{t.has(role.code) ? t(role.code) : role.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("capabilities")} ({capabilities.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.map((capability) => (
                      <Badge key={capability.code} variant="outline" title={capability.description}>
                        {capability.code}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
