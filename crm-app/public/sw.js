// Service worker del CRM: solo muestra los avisos que manda el servidor y abre la conversación al pulsarlos.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Nuevo aviso", {
      body: data.body || "",
      icon: "/icon",
      // Android pinta el icono pequeño de la barra en blanco: el logo sin fondo es justo eso.
      badge: "/brand-logo.png",
      data: { url: data.url || "/conversaciones" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/conversaciones";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    })
  );
});
