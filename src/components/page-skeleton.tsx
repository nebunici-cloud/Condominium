import { Skeleton } from "@/components/ui/skeleton";

function PageSkeletonBody({ rows, breadcrumbLevels }: { rows: number; breadcrumbLevels: number }) {
  return (
    <>
      {breadcrumbLevels > 0 && (
        <div className="mb-3 flex items-center gap-1.5">
          {Array.from({ length: breadcrumbLevels }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-20" />
          ))}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </>
  );
}

export function PageSkeleton({
  rows = 5,
  breadcrumbLevels = 0,
  bare = false,
}: {
  rows?: number;
  breadcrumbLevels?: number;
  // Skip the <main> wrapper for routes nested under a layout that
  // already provides it (e.g. the /settings sub-pages).
  bare?: boolean;
}) {
  if (bare) {
    return <PageSkeletonBody rows={rows} breadcrumbLevels={breadcrumbLevels} />;
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <PageSkeletonBody rows={rows} breadcrumbLevels={breadcrumbLevels} />
    </main>
  );
}
