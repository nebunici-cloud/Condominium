import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/breadcrumbs";

import { AddFeeTypeDialog } from "./add-fee-type-dialog";
import { ChangeMethodDialog } from "./change-method-dialog";
import { EnableSuggestedButton } from "./enable-suggested-button";

const methodLabelKeys: Record<string, string> = {
  cota_parte: "methodCotaParte",
  by_area: "methodByArea",
  per_unit: "methodPerUnit",
  per_resident: "methodPerResident",
  by_meter: "methodByMeter",
};

export default async function FinanceSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("financeSetup");
  const tAssociations = await getTranslations("associations");
  const supabase = await createClient();

  const { data: association } = await supabase
    .from("associations")
    .select("id, tenant_id, name")
    .eq("id", id)
    .maybeSingle();

  if (!association) {
    notFound();
  }

  const [{ data: suggestions }, { data: feeTypes }] = await Promise.all([
    supabase
      .from("config_registry")
      .select("key, label")
      .eq("association_id", id)
      .eq("category", "expense_category")
      .order("sort_order", { ascending: true }),
    supabase
      .from("fee_types")
      .select("id, key, label, allocation_rules(method, version, is_active)")
      .eq("association_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const existingKeys = new Set((feeTypes ?? []).map((f) => f.key));
  const suggestedNotEnabled = (suggestions ?? []).filter((s) => !existingKeys.has(s.key));

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <Breadcrumbs
        items={[
          { label: tAssociations("title"), href: "/associations" },
          { label: association.name, href: `/associations/${association.id}` },
          { label: t("title") },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { association: association.name })}
        </p>
      </div>

      {suggestedNotEnabled.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-medium">{t("suggestedFeeTypes")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("suggestedFeeTypesHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestedNotEnabled.map((suggestion) => (
              <Card key={suggestion.key}>
                <CardHeader>
                  <CardTitle className="text-base">{suggestion.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <EnableSuggestedButton
                    tenantId={association.tenant_id}
                    associationId={association.id}
                    configKey={suggestion.key}
                    label={suggestion.label}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">{t("feeTypesTitle")}</h2>
          <AddFeeTypeDialog tenantId={association.tenant_id} associationId={association.id} />
        </div>

        {!feeTypes || feeTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noFeeTypes")}</p>
        ) : (
          <div className="grid gap-3">
            {feeTypes.map((feeType) => {
              const activeRule = feeType.allocation_rules.find((r) => r.is_active);
              return (
                <Card key={feeType.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{feeType.label}</CardTitle>
                    <CardDescription>
                      {activeRule
                        ? `${t("currentMethod")}: ${t(methodLabelKeys[activeRule.method])} (${t("version", { version: activeRule.version })})`
                        : t("noActiveRule")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-2">
                    <Badge variant="outline">{feeType.key}</Badge>
                    <ChangeMethodDialog
                      feeTypeId={feeType.id}
                      currentMethod={activeRule?.method ?? null}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{t("reserveFundNote")}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t("comingLaterNote")}</p>
    </main>
  );
}
