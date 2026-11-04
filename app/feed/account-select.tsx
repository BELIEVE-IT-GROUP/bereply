"use client";

import { useRef } from "react";
import { chooseAccountAction } from "./actions";

export function AccountSelect({ accounts, current }: { accounts: Array<{ id: string; username: string }>; current: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  if (accounts.length === 0) return null;
  return (
    <form ref={form} action={chooseAccountAction} className="marca">
      <label htmlFor="marca"><small>Marca</small></label>
      <select id="marca" name="accountId" className="sel" defaultValue={current ?? undefined} key={current} onChange={() => form.current?.requestSubmit()}>
        {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
      </select>
    </form>
  );
}
