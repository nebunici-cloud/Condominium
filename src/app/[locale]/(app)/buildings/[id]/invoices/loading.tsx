import { PageSkeleton } from "@/components/page-skeleton";

export default function Loading() {
  return <PageSkeleton breadcrumbLevels={4} rows={6} />;
}
