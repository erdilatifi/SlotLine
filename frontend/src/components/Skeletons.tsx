import { Card, Skeleton } from "./ui";

/**
 * Skeletons shaped like the thing they stand in for, not grey rectangles.
 * The point is that nothing jumps when the data lands — a placeholder of
 * the wrong height is worse than none, because the page reflows twice.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="pb-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-64" />
    </div>
  );
}

/** Matches the booking rows: time column, two lines of detail, a badge. */
export function BookingListSkeleton({ days = 2, rows = 3 }: { days?: number; rows?: number }) {
  return (
    <div className="space-y-8">
      {Array.from({ length: days }).map((_, day) => (
        <section key={day}>
          <Skeleton className="mb-3 h-3.5 w-32" />
          <Card className="divide-y divide-line-soft overflow-hidden">
            {Array.from({ length: rows }).map((_, row) => (
              <div key={row} className="flex items-center gap-4 px-4 py-3.5">
                <div className="w-[4.5rem] shrink-0">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="mt-1.5 h-3 w-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-1.5 h-3 w-56" />
                </div>
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

/** Avatar, two lines, an action — the shape of clients and team rows. */
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card className="divide-y divide-line-soft overflow-hidden">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-1.5 h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </Card>
  );
}

/** Standalone cards with a title line and a couple of detail lines. */
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, row) => (
        <Card key={row} className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-16 rounded-lg" />
        </Card>
      ))}
    </div>
  );
}

/** Two-column forms, the shape settings uses. */
export function FormSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div className="max-w-2xl space-y-6">
      {Array.from({ length: sections }).map((_, section) => (
        <Card key={section} className="p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, field) => (
              <div key={field}>
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="mt-2 h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
