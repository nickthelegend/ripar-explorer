import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsView } from "./jobs-view";
import { Panel, TableSkeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Jobs",
  description:
    "The Ripar job board: open, bidding, running, verifying, verified and failed work, with budgets, bid counts and escrow state for each.",
  alternates: { canonical: "/jobs" },
};

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
          <div className="skel mb-6 h-7 w-32" />
          <Panel>
            <TableSkeleton rows={8} cols={6} />
          </Panel>
        </div>
      }
    >
      <JobsView />
    </Suspense>
  );
}
