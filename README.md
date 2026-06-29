# Asimov

App de escritorio para Windows del ERP [Bartez Tecnología](https://bartez.com.ar).
Gestión comercial nativa: impresión directa, notificaciones, multi-servidor y
actualización automática.

> **Arquitectura:** Asimov **no** empaqueta el frontend. Carga la web remota
> del ERP y comparte backend y base de datos con la versión web. Cada deploy de
> la web actualiza la app al instante.

## Instalación

Descargar el último instalador desde [Releases](https://github.com/equazin/asimov-app/releases/latest)
y ejecutar **Asimov-Setup-x.x.x.exe**.

Al abrir por primera vez aparece la pantalla de bienvenida y el selector de servidor.
Ingresá la URL del ERP (ej: `https://bartez.com.ar`) y opcionalmente un nombre.

## Desarrollo

```bash
npm install
npm run dev      # compila TS y abre Electron en modo desarrollo
```

Para desarrollo ingresá `http://localhost:3000` o `https://bartez.com.ar`.

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run build` | Compila TypeScript (`src/` → `dist/`) y copia assets |
| `npm run dev` | Build + abre Electron con DevTools habilitado |
| `npm run start` | Build + abre Electron en modo normal |
| `npm run dist` | Genera el instalador NSIS (`.exe`) en `release/` |
| `npm run dist:dir` | Empaqueta sin instalador (carpeta, para pruebas) |
| `npm run smoke-test` | Lanza la app, verifica estabilidad, cierra |
| `npm run release` | Build + publish a GitHub Releases |

## Estructura

```
src/
├── main.ts            Proceso principal (ventanas, sesión, navegación)
├── ipc.ts             Handlers IPC (servidor, impresión, notificaciones)
├── tray.ts            Ícono de bandeja del sistema
├── menu.ts            Menú nativo de la app
├── updater.ts         Auto-actualización (electron-updater)
├── config.ts          Configuración local persistente (electron-store)
├── preload.ts         Puente seguro para la ventana del ERP
├── picker-preload.ts  Puente para el selector de servidor
├── picker.html        UI del primer arranque y selector de servidor
├── splash.html        Pantalla de carga
└── offline.html       Pantalla sin conexión
```

## Capacidades

- Onboarding de bienvenida en primer arranque
- Selector multi-servidor con historial y labels editables
- Sesión persistente aislada (`persist:bartez`)
- Impresión nativa con fallback a `window.print()`
- Notificaciones nativas para leads y alertas
- Tray icon con acceso rápido y minimizar a bandeja
- Deeplinks `bartez://open?path=/admin/...`
- Inicio automático con Windows
- Auto-actualización vía GitHub Releases

## API nativa expuesta a la web

```js
if (window.bartezDesktop?.isDesktop) {
  await window.bartezDesktop.print({ silent: true });
  await window.bartezDesktop.notify({ title, body });
  const printers = await window.bartezDesktop.listPrinters();
  await window.bartezDesktop.setLaunchAtStartup(true);
}
```

## Publicar una nueva versión

```bash
npm version patch   # o minor/major
git tag v$(node -p "require('./package.json').version")
git push && git push --tags
```

El workflow `release.yml` se activa con tags `v*`, compila en Windows y publica
el instalador como GitHub Release.

## Firma de código (pendiente)

Para evitar SmartScreen, se necesita un certificado EV/OV.
Agregar como GitHub Secrets:
- `WIN_CSC_LINK` — archivo .pfx en base64
- `WIN_CSC_KEY_PASSWORD` — contraseña del certificado

Y descomentar las líneas de signing en `electron-builder.yml` y `.github/workflows/release.yml`.

---

**Asimov** by [Bartez Tecnología](https://bartez.com.ar)
