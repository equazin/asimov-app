import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shell = readFileSync(resolve(process.cwd(), 'src/shell.html'), 'utf8');
const preload = readFileSync(resolve(process.cwd(), 'src/preload.ts'), 'utf8');

describe('panel de recuperación cloud', () => {
  it('abre el estado detallado desde el indicador', () => {
    expect(shell).toContain('onclick="openCloudRecovery()"');
    expect(shell).toContain('Estado de la nube');
    expect(shell).toContain('Reintentar bloqueados');
    expect(shell).toContain('Subir datos locales');
  });

  it('distingue sesión vencida y muestra credenciales locales faltantes', () => {
    expect(shell).toContain('syncLabel.textContent = s.lastError ? "Sesión vencida" : "Sólo local"');
    expect(shell).toContain('AIR necesita su contraseña en esta PC.');
    expect(shell).toContain('WhatsApp necesita su token en esta PC.');
    expect(shell).toContain('ARCA necesita certificado y clave privada en esta PC.');
  });
  it('refresca la vista activa cuando llegan cambios remotos', () => {
    expect(preload).toContain('ipcRenderer.on("sync:applied"');
    expect(shell).toContain('api.cloudSync.onApplied');
    expect(shell).toContain('event.pulled > 0) refreshCurrentView()');
  });
});
