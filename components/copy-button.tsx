"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Every hash, address and ID on a detail page is one click from the clipboard.
 * The confirmation state is what separates a working explorer from a mockup:
 * without it you click, nothing visible happens, and you click again.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard is blocked on insecure origins and in some embedded
          // webviews. Selecting the text still works, so fail quietly.
        }
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      className="inline-flex h-5 w-5 flex-none items-center justify-center rounded transition-colors hover:bg-black/[0.06]"
      style={{ color: copied ? "var(--ok)" : "var(--ink-3)" }}
    >
      {copied ? <Check size={12.5} strokeWidth={2.4} /> : <Copy size={12.5} strokeWidth={2} />}
    </button>
  );
}

/** Mono value + copy affordance, the pairing used on every detail row. */
export function Mono({
  value,
  display,
  label,
  href,
}: {
  value: string;
  display?: string;
  label: string;
  href?: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="truncate font-mono text-[12.5px] underline-offset-2 hover:underline"
          style={{ color: "var(--accent-deep)" }}
          title={value}
        >
          {display ?? value}
        </a>
      ) : (
        <span className="truncate font-mono text-[12.5px]" title={value}>
          {display ?? value}
        </span>
      )}
      <CopyButton text={value} label={label} />
    </span>
  );
}
