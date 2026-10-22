"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// Alta pública: crea la cuenta con prueba gratis y lleva al asistente de alta.
export default function RegistroPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    setLoading(true);
    setError("");
    try {
      await api("/auth/signup", {
        method: "POST",
        body: { business_name: form.get("business_name"), display_name: form.get("display_name"), email: form.get("email"), password },
      });
      router.replace("/alta");
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
            <b>Crea tu cuenta</b>
            <span>Prueba gratis tu asistente comercial</span>
          </div>
        </div>
        <form onSubmit={onSubmit}>
          <label className="f" htmlFor="business_name">Nombre de tu negocio</label>
          <input className="i" id="business_name" name="business_name" autoComplete="organization" required />
          <label className="f" htmlFor="display_name">Tu nombre</label>
          <input className="i" id="display_name" name="display_name" autoComplete="name" />
          <label className="f" htmlFor="email">Email</label>
          <input className="i" id="email" name="email" type="email" autoComplete="email" required />
          <label className="f" htmlFor="password">Contraseña</label>
          <input className="i" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          {error && <p role="alert" className="alert error" style={{ marginTop: 12 }}>{error}</p>}
          <button className="btn primary" type="submit" disabled={loading}>{loading ? "Creando…" : "Crear cuenta y empezar"}</button>
        </form>
        <p className="sub" style={{ marginTop: 14, fontSize: 14 }}>¿Ya tienes cuenta? <Link href="/login">Entra</Link></p>
      </div>
    </main>
  );
}
