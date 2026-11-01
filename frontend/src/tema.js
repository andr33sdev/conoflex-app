// Tema oscuro/claro. Lo que manda es lo guardado en el servidor para el usuario (vale en todos sus dispositivos);
// localStorage es solo una copia para que la pantalla no parpadee al abrir.
import { useSyncExternalStore } from "react";
import { getApiUrl } from "./apiConfig";

const CLAVE_ULTIMO = "tema_conoflex_ultimo";
const clavePorUsuario = (id) => `tema_conoflex_${id}`;
const valido = (t) => (t === "claro" || t === "oscuro" ? t : null);
const leer = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const escribir = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
};

let actual = valido(leer(CLAVE_ULTIMO)) || "oscuro";
let usuarioId = null;
const oyentes = new Set();

function aplicar(t) {
  actual = t;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.tema = t;
    document.documentElement.style.colorScheme = t === "claro" ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "claro" ? "#f4f4f5" : "#0e0e11");
  }
  escribir(CLAVE_ULTIMO, t);
  if (usuarioId) escribir(clavePorUsuario(usuarioId), t);
  oyentes.forEach((f) => f());
}

aplicar(actual);

/** Al iniciar sesión (o abrir la app con sesión): usa la copia local al instante y confirma con el servidor. */
export async function sincronizarTema(usuario) {
  if (!usuario?.id) {
    usuarioId = null;
    return;
  }
  usuarioId = usuario.id;
  aplicar(valido(usuario.tema) || valido(leer(clavePorUsuario(usuario.id))) || actual);
  try {
    const res = await fetch(getApiUrl("/api/mi-tema"));
    if (!res.ok) return;
    const d = await res.json();
    if (usuarioId === usuario.id && valido(d.tema)) aplicar(d.tema);
  } catch {
    /* sin conexión: queda la copia local */
  }
}

export function olvidarUsuarioTema() {
  usuarioId = null;
  aplicar("oscuro");
}

/** Cambia el tema y lo guarda en el servidor. Devuelve false si no se pudo guardar (queda aplicado en este dispositivo). */
export async function cambiarTema(t) {
  const nuevo = valido(t);
  if (!nuevo) return true;
  aplicar(nuevo);
  try {
    const res = await fetch(getApiUrl("/api/mi-tema"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tema: nuevo }) });
    return res.ok;
  } catch {
    return false;
  }
}

export function useTema() {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => actual,
  );
}
