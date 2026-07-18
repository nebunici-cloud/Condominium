import {
  DropletIcon,
  ZapIcon,
  FlameIcon,
  ArrowUpDownIcon,
  Building2Icon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

// One glyph per maintenance category, so a list of request cards is
// scannable at a glance. Pure/presentational -- safe in server and
// client components alike. Unknown/null categories fall back to a
// generic wrench.
const categoryIcons: Record<string, LucideIcon> = {
  plumbing: DropletIcon,
  electrical: ZapIcon,
  heating: FlameIcon,
  elevator: ArrowUpDownIcon,
  common_area: Building2Icon,
  other: WrenchIcon,
};

export function CategoryIcon({
  category,
  className = "size-3.5 shrink-0",
}: {
  category: string | null;
  className?: string;
}) {
  const Icon = categoryIcons[category ?? "other"] ?? WrenchIcon;
  return <Icon className={className} aria-hidden />;
}
