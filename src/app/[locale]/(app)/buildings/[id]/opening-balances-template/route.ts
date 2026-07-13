import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> }
) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "openingBalances" });
  const tUnits = await getTranslations({ locale, namespace: "units" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("title"));

  sheet.columns = [
    { header: tUnits("unitNumberLabel"), key: "unit_number", width: 16 },
    { header: t("amountLabel"), key: "amount", width: 30 },
    { header: t("asOfDateLabel"), key: "as_of_date", width: 16 },
    { header: t("noteLabel"), key: "note", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({ unit_number: "12", amount: 350.5, as_of_date: "", note: "" });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="opening-balances-template.xlsx"',
    },
  });
}
