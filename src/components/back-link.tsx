import { ChevronLeftIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
      <Link href={href}>
        <ChevronLeftIcon />
        {label}
      </Link>
    </Button>
  );
}
