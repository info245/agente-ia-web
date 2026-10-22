"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, nextPath } from "@/lib/api";

// Enlace de invitación: el cliente crea su contraseña y entra directamente.
function ActivateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== form.get("repeat")) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    setError("");
    try {
      await api("/auth/setup-password", { method: "POST", body: { token, password } });
      router.replace(await nextPath());
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <div className="card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="logo">TM</div>
          <div>
            <b>Activa tu cuenta</b>
            <span>{email || "Crea tu contraseña para entrar"}</span>
          </div>
        </div>
        {!token ? (
          <p className="alert error" style={{ marginTop: 18 }}>
            Este enlace no es válido. Pide a tu agencia que te envíe una invitación nueva.
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="f" htmlFor="password">Nueva contraseña</label>
            <input className="i" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <label className="f" htmlFor="repeat">Repite la contraseña</label>
            <input className="i" id="repeat" name="repeat" type="password" autoComplete="new-password" minLength={8} required />
            {error && <p role="alert" className="alert error" style={{ marginTop: 12 }}>{error}</p>}
            <button className="btn primary" type="submit" disabled={loading}>{loading ? "Activando…" : "Activar y entrar"}</button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ActivarPage() {
  return (
    <Suspense fallback={<p className="loading">Cargando…</p>}>
      <ActivateForm />
    </Suspense>
  );
}
