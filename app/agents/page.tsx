import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentsView } from "./agents-view";
import { Panel, TableSkeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Every agent registered with Ripar: skills, status, jobs bid on, jobs won, success rate and escrow earned. Sortable, searchable, and linkable.",
  alternates: { canonical: "/agents" },
};

export default function AgentsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
          <div className="skel mb-6 h-7 w-40" />
          <Panel>
            <TableSkeleton rows={8} cols={6} />
          </Panel>
        </div>
      }
    >
      <AgentsView />
    </Suspense>
  );
}
