"use client";

import { useState, type FormEvent } from "react";

interface ContactTagsProps {
  contactId: string;
  username: string | null;
  igUserId: string;
  tags: string[];
}

export default function ContactTags({
  contactId,
  username,
  igUserId,
  tags: initialTags,
}: ContactTagsProps) {
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  async function handleAddTag(e: FormEvent) {
    e.preventDefault();
    const tag = input.trim();
    if (!tag || tags.includes(tag) || pending) return;

    setPending(true);
    setInput("");

    try {
      const res = await fetch(`/api/contacts/${contactId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      const data = await res.json();
      if (data.success) setTags(data.data.tags);
    } catch (err) {
      console.error("Failed to add tag:", err);
    } finally {
      setPending(false);
    }
  }

  async function handleRemoveTag(tag: string) {
    const previousTags = tags;
    setTags((prev) => prev.filter((t) => t !== tag));

    try {
      const res = await fetch(`/api/contacts/${contactId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      const data = await res.json();
      if (data.success) {
        setTags(data.data.tags);
      } else {
        setTags(previousTags);
      }
    } catch (err) {
      console.error("Failed to remove tag:", err);
      setTags(previousTags);
    }
  }

  return (
    <div className="panel rounded p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground truncate">
          {username ? `@${username}` : igUserId}
        </p>
        {username && <p className="text-xs text-muted">{igUserId}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="leading-none text-muted hover:text-error"
            >
              ×
            </button>
          </span>
        ))}

        <form onSubmit={handleAddTag}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add tag…"
            disabled={pending}
            className="w-24 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground placeholder:text-zinc-500 outline-none focus:border-accent/40 disabled:opacity-50"
          />
        </form>
      </div>
    </div>
  );
}
