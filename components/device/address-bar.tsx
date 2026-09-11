"use client";

import { ExternalLinkIcon, RotateCwIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { IconButton, IconLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { normalizeInput } from "@/lib/url";
import { cn } from "@/lib/utils";

interface AddressBarProps {
  url: string;
  loading: boolean;
  onNavigate: (url: string) => void;
  onReload: () => void;
}

export function AddressBar({ url, loading, onNavigate, onReload }: AddressBarProps) {
  const [draft, setDraft] = useState(url);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(url);
    setInvalid(false);
  }, [url]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = normalizeInput(draft);
    if ("error" in result) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onNavigate(result.url);
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          aria-label="Address"
          aria-invalid={invalid}
          spellCheck={false}
          autoComplete="off"
          className={cn("h-8 pr-8 text-micro placeholder:text-micro", invalid && "border-fail")}
        />
        {loading ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 right-2.5 size-1.5 -translate-y-1/2 animate-pulse rounded-full bg-crease"
          />
        ) : null}
      </div>

      <Tooltip label="Reload (R)">
        <IconButton size="sm" onClick={onReload} aria-label="Reload the page">
          <RotateCwIcon
            className={cn("size-3.5", loading && "animate-spin")}
            aria-hidden="true"
          />
        </IconButton>
      </Tooltip>

      <Tooltip label="Open in a new tab">
        <IconLink
          size="sm"
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open in a new tab"
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </IconLink>
      </Tooltip>
    </form>
  );
}
