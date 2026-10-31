// Avisos al celular: muestra la notificación que manda el servidor y, al tocarla, abre el módulo que corresponde.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { titulo: "Conoflex", texto: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "Conoflex", {
      body: d.texto || "",
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: d.ruta || "conoflex",
      renotify: true,
      data: { ruta: d.ruta || "/agentes" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ruta = (e.notification.data && e.notification.data.ruta) || "/agentes";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) {
          if ("navigate" in v) v.navigate(ruta).catch(() => {});
          return v.focus();
        }
      }
      return self.clients.openWindow(ruta);
    }),
  );
});
