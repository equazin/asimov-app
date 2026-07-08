import { contextBridge, ipcRenderer } from "electron";

const api = {
  createClient: (client: any) => {
    ipcRenderer.send("shell:client-created", { client });
  },
  // Padrón AFIP: CUIT → razón social + condición IVA + domicilio
  padronLookup: (cuit: string) =>
    ipcRenderer.invoke("afip:padron", cuit) as Promise<{ ok: boolean; data?: { razonSocial: string; condicionIva: string; domicilio: string; localidad: string; provincia: string; codPostal: string }; error?: string }>,
  cancel: () => {
    ipcRenderer.send("shell:client-created", { client: null });
  },
};

contextBridge.exposeInMainWorld("asimovNewClient", api);
export type AsimovNewClientApi = typeof api;
