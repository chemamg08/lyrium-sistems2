# Checklist de auditoria

Estado: en curso
Regla de trabajo: no se modifica codigo de la app sin autorizacion explicita del usuario. Solo se documentan hallazgos en `holafinal.md`.

## Ya revisado

- [x] Arquitectura general de frontend y backend
- [x] Entrypoints y enrutado principal del backend
- [x] Autenticacion, cookies, refresh y control de acceso base
- [x] Suscripciones, Stripe y validaciones de plan principales
- [x] Casos, improve-ai y varios fallos de aislamiento multi-cuenta
- [x] Facturas publicas, numeracion y riesgos de XSS
- [x] Firma y varios cruces de recursos entre cuentas
- [x] Workers, schedulers y riesgos de despliegue multi-instancia
- [x] Webhooks, secretos y limitaciones operativas de la UI
- [x] Descarga de adjuntos de Email y WhatsApp
- [x] Automatizaciones Email y WhatsApp end-to-end
- [x] Apartado lateral Inicio (dashboard, calendario y modales del home)
- [x] Build de produccion completa (`npm run build`)

## Pendiente exacto

### 1. Flujos completos del frontend

- [ ] Landing -> signup -> verify email -> login -> 2FA -> app
- [ ] Restauracion de sesion tras recarga, cierre de pestaña y expiracion
- [ ] Guards de rutas, redirects y pantallas inaccesibles o huerfanas
- [ ] Flujos de error visibles para usuario en auth, billing y modulos clave

### 2. Modulos funcionales de uso diario

- [ ] Clientes: alta, edicion, listado, acciones, exportaciones
- [ ] Facturas desde UI: crear, ver, enviar, imprimir, publicar
- [ ] Contratos: crear, editar, enviar a firma, descargar, branding
- [ ] Calendar: conexiones, sincronizacion y rutas realmente usadas en frontend
- [ ] Assistant / chats / defense / writing / fiscal / tax compliance

### 3. Integraciones end-to-end

- [x] WhatsApp completo: configuracion, uso desde UI y acceso a adjuntos
- [x] Automatizaciones email/WhatsApp completas desde UI hasta backend
- [x] API keys / API publica / endpoints expuestos para terceros
- [ ] Admin: flujos reales, limites y operaciones sensibles

### 4. Cierre de auditoria

- [ ] Revisar si quedan hallazgos de rendimiento y chunking en frontend
- [ ] Eliminar posibles falsos positivos o solapes en `holafinal.md`
- [ ] Priorizar hallazgos por impacto real en produccion
- [ ] Confirmar que no queda ningun flujo critico sin revisar

## Proximo paso operativo

Bloque de Inicio auditado y documentado en `holafinal.md`. El siguiente paso queda pendiente de autorizacion del usuario.

## Ultimos hallazgos confirmados

- [x] La API publica puede escribir archivos a disco antes de validar ownership del `clientId` (#31)
- [x] Borrar una base contractual deja chats huerfanos y estado colgante en frontend (#32)
- [x] `GET /automatizaciones` expone al navegador passwords cifrados y tokens internos de WhatsApp (#33)
- [x] El modal de sesiones/numeros de WhatsApp esta roto por mismatch de rutas y shape de datos (#34)
- [x] Con varios numeros de WhatsApp, los mensajes pueden salir por el remitente equivocado (#35)
- [x] El email manual puede mostrarse como enviado en UI aunque el backend falle (#36)
- [x] `refresh-token` y `token-status` de WhatsApp no validan ownership de la cuenta (#37)
- [x] El envio manual de WhatsApp puede fallar por `instanceName` ausente aunque la cuenta figure conectada (#38)
- [x] Desconectar un numero de WhatsApp puede dejar una sesion legacy zombi (#39)
- [x] El envio manual de WhatsApp no es atomico y puede dejar mensajes fantasma y archivos huerfanos (#40)
- [x] El polling de Email puede quedar colgado al borrar la ultima cuenta (#41)
- [x] WhatsApp puede guardar como `long` y 60 dias un token Meta que realmente no lo es (#42)
- [x] El `alertEmail` de WhatsApp no dispara alertas reales de caducidad (#43)
- [x] El widget de calendario de Inicio no puede mostrar bien los eventos del dia por mismatch de contrato (#44)
- [x] Shared Files en Inicio permite falsificar destinatarios y remitente porque el backend confia en datos del cliente (#45)