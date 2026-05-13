import difflib

with open('holafinal.md', 'r', encoding='utf-8') as f:
    new_content = f.read()

inserted_block = """**Plan tecnico detallado (punto 64):**
- Extender `DefenseEvidence` con campos: `filePath`, `fileSize`, `mimeType`, `publicToken` (UUID aleatorio), `isDeleted`, `deletedAt`, `createdBy`.
- Crear middleware `multerDefense.ts` con `fileFilter` para PDF, imágenes, video, audio; sin límite de tamaño por archivo individual.
- Almacenar archivos en `uploads/evidence/<createdBy>/<randomName>`.
- Control de cuota: 10 GB acumulados por `createdBy`. Se calcula sumando `fileSize` de todos los `DefenseEvidence` activos (`isDeleted: false`) de ese usuario. Si la subida supera la cuota, rechazar con 413.
- Nuevos endpoints (autenticados):
  - `POST /defense-chat/:chatId/evidence/upload` — subir archivo, generar `publicToken`, validar cuota.
  - `GET /defense-chat/evidence/library?accountId=` — listar pruebas del usuario (`createdBy`, `isDeleted: false`).
  - `GET /defense-chat/evidence/trash?accountId=` — listar papelera (`isDeleted: true`).
  - `POST /defense-chat/evidence/:evidenceId/trash` — soft delete (`isDeleted: true`, `deletedAt`).
  - `POST /defense-chat/evidence/:evidenceId/restore` — restaurar desde papelera.
  - `DELETE /defense-chat/evidence/:evidenceId/permanent` — borrar archivo de disco y registro de BD.
- Nuevo endpoint público (sin auth, solo token):
  - `GET /public/evidence/:token` — buscar por `publicToken`, si `isDeleted` o no existe devolver 404; si existe, servir archivo según `mimeType`: video/mp4 → inline video, image/* → inline image, audio/* → inline audio, application/pdf → inline PDF, resto → descarga con `Content-Disposition: attachment`. Token = UUID largo no adivinable.
- Al soft-deletear o eliminar permanentemente, el token queda invalidado automáticamente porque la query filtra `isDeleted: false`.
- Integrar en `generateDefensePDF` (pdfService.ts): añadir sección "Evidencias adjuntas" al final de cada estrategia, listando nombre de prueba + enlace público completo (`https://<domain>/public/evidence/<token>`).
- Frontend (`DefensePrep.tsx`):
  - Añadir botón "Biblioteca de pruebas" junto a la pestaña Pruebas.
  - Modal de biblioteca con listado, drag-and-drop de subida, visor inline según tipo, botón de papelera.
  - Modal de papelera con opción de restaurar o borrar permanentemente.
  - Indicador de espacio usado / 10 GB.
"""

marker = "\n" + inserted_block + "\n"
old_content = new_content.replace(marker, "\n")

old_lines = old_content.splitlines(keepends=True)
new_lines = new_content.splitlines(keepends=True)

diff = list(difflib.unified_diff(old_lines, new_lines, fromfile='holafinal.md', tofile='holafinal.md'))
print(''.join(diff), end='')
