import { Search } from "lucide-react";

/**
 * One input, three kinds of answer.
 *
 * A plain GET form with no client JavaScript at all: the result is a URL, the
 * back button works, and the control keeps working in a page whose JS never
 * arrives. The header's ⌘K palette searches the sample dataset; this searches
 * the chain, and the two must not be confused, which is why it lives on the
 * registry pages rather than in the chrome.
 */
export function RegistrySearch({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/search" method="get" role="search" className="mt-4 flex w-full max-w-[560px] items-center gap-2">
      <label htmlFor="registry-q" className="sr-only">
        Agent id, domain, Algorand address or transaction id
      </label>
      <div
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5"
        style={{ borderColor: "var(--line-strong)", background: "var(--panel)" }}
      >
        <Search size={13.5} strokeWidth={2} aria-hidden style={{ color: "var(--ink-3)", flex: "none" }} />
        <input
          id="registry-q"
          name="q"
          defaultValue={defaultValue}
          placeholder="Agent id, domain, Algorand address, or transaction id"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: "var(--ink)" }}
        />
      </div>
      <button
        type="submit"
        className="flex-none rounded-lg px-3 py-[7px] text-[13px] font-medium"
        style={{ background: "var(--accent-deep)", color: "#fff" }}
      >
        Resolve
      </button>
    </form>
  );
}
