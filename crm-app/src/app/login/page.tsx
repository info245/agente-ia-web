"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", body: { email: form.get("email"), password: form.get("password") } });
      router.replace("/inicio");
    } catch (err) {
      setError((err as Error).message === "Credenciales invalidas" ? "El email o la contraseña no son correctos." : (err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <div className="card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="logo">TM</div>
          <div>
            <b>Tu asistente comercial</b>
            <span>Conversaciones, contactos y resultados</span>
          </div>
        </div>
        <form onSubmit={onSubmit}>
          <label className="f" htmlFor="email">Email</label>
          <input className="i" id="email" name="email" type="email" autoComplete="email" required />
          <label className="f" htmlFor="password">Contraseña</label>
          <input className="i" id="password" name="password" type="password" autoComplete="current-password" required />
          {error && <p role="alert" className="alert error" style={{ marginTop: 12 }}>{error}</p>}
          <button className="btn primary" type="submit" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
        </form>
      </div>
    </main>
  );
}
