# Dashboard de oportunidades comerciales

Aplicacion estatica con lectura, registro, cambio de estado y eliminacion en una lista de SharePoint. No usa datos de ejemplo ni guarda oportunidades en localStorage. Solo recuerda la vista y el ID publico de la aplicacion; MSAL administra la sesion en sessionStorage.

Para construir una aplicacion equivalente desde cero en otro sitio, usa la [guia de recreacion con prompts para GitHub Copilot](./GUIA-RECREAR-CON-COPILOT.md). La unica entrada editable de los prompts es la URL del sitio; los identificadores de SharePoint y Entra se obtienen durante el aprovisionamiento autorizado.

## Lista de SharePoint

- Sitio: https://m365x30064847.sharepoint.com/sites/demo-ia-with-copilot
- Lista: [Oportunidades](https://m365x30064847.sharepoint.com/sites/demo-ia-with-copilot/Lists/Oportunidades)
- Tenant: `29c3ef0e-00a3-4611-b0ee-f5b3d3fffec3`

La lista ya fue creada en el sitio con estas columnas obligatorias:

| Nombre interno | Nombre visible | Tipo |
| --- | --- | --- |
| Title | Proyecto | Texto |
| Cliente | Cliente | Texto, hasta 80 caracteres |
| Presupuesto | Presupuesto | Numero, dos decimales, minimo 0 |
| Estado | Estado | Eleccion: Prospecto, Negociacion, Ganada, Perdida |
| Fecha | Fecha | Fecha sin hora |

El valor real de la opcion Negociacion lleva tilde, igual que en el formulario. Los IDs y las versiones (ETag) proceden de SharePoint. Las lecturas siguen la paginacion y las escrituras rechazan conflictos de edicion (HTTP 412).

## Persona asignada y sincronizacion

Ambas listas tienen la columna **Asignado a**, nombre interno `AsignadoA`, de tipo Persona, de seleccion unica y solo personas. En REST se escribe `AsignadoAId`; el valor es el ID de usuario de SharePoint, no su nombre ni su correo. La columna esta incluida en las vistas predeterminadas de ambas listas.

- Al registrar una oportunidad en la web, selecciona un miembro del sitio. En tabla y tarjetas puedes cambiarlo con el selector **Asignado a**; el cambio se guarda inmediatamente en SharePoint y se propaga a los documentos relacionados.
- El selector consulta el grupo de miembros asociado al sitio, no todos los usuarios del directorio ni todos los usuarios que han visitado el sitio. Admite personas directamente incluidas y expande el grupo Microsoft 365 mediante la API de directorio de SharePoint, siguiendo la paginacion. Vuelve a comprobar la pertenencia antes de guardar. Un grupo que no pueda enumerarse produce un error explicito.
- La oportunidad es la fuente del responsable. Cada registro documental guarda una copia como metadato; no se modifica el contenido binario del archivo. Una nueva carga consulta primero la asignacion actual de la oportunidad.
- Al abrir/conectar el dashboard y al pulsar **Actualizar** o **Actualizar documentos**, se leen las oportunidades y se sincronizan los responsables de todos los documentos. Las escrituras solo se hacen si el valor cambio y utilizan el ETag del documento. Los errores parciales indican el documento pendiente; actualizar reintenta sin volver a escribir los que ya coinciden.
- No hay un proceso en segundo plano: con la web cerrada no se sincroniza. Si se modifica un responsable por otro cliente de SharePoint, al actualizar la web se propaga el valor de la oportunidad. Cambiar solo el metadato de un documento no cambia la oportunidad: la siguiente sincronizacion lo reemplaza por el responsable de esta.
- Las cinco oportunidades previas permanecen **Sin asignar** hasta elegir su responsable; no se asigna una persona arbitrariamente. La columna no es obligatoria en SharePoint para preservar esos registros; si un usuario deja de ser miembro, la web conserva la asignacion historica y permite elegir otro miembro.

La columna de persona esta restringida al grupo de miembros del sitio (`SelectionGroup=5` en este sitio). SharePoint no expande el grupo Microsoft 365 anidado al buscar personas en su selector nativo. Por decision de uso, **asignar y reasignar se hace desde la web**; SharePoint muestra el resultado en ambas listas. No se ampliaron los permisos, no se concedio acceso a nuevas personas ni se agregaron usuarios directamente al grupo para sortear esta limitacion.

Crear las columnas y agregarlas a las vistas requiere permisos de administracion de listas. Se realizo con la sesion del sitio; el dashboard mantiene el permiso delegado `AllSites.Write` para las operaciones sobre registros. Para recrearlas, crea primero el campo Persona con etiqueta ASCII `AsignadoA` y despues cambia su titulo visible a `Asignado a`.

## Documentos por oportunidad

La lista [DocumentosOportunidades](https://m365x30064847.sharepoint.com/sites/demo-ia-with-copilot/Lists/DocumentosOportunidades) ya esta creada en el mismo sitio. Cada registro contiene un archivo como adjunto de lista y una relacion obligatoria con Oportunidades; no es una biblioteca documental ni un enlace a archivos locales.

| Nombre interno | Tipo y uso |
| --- | --- |
| Title | Nombre del archivo |
| Oportunidad | Lookup obligatorio a Oportunidades; en REST se escribe OportunidadId |
| AsignadoA | Persona unica, heredada de la oportunidad; en REST se escribe AsignadoAId |
| EstadoValidacion | Eleccion: Pendiente, Validado, Rechazado; inicial Pendiente |
| Observaciones | Texto multilinea sin formato |
| ValidadoPor | Cuenta que registra la revision |
| FechaValidacion | Fecha y hora UTC de la revision |
| AttachmentFiles | Adjunto binario del registro |

Los adjuntos y el historial de versiones estan habilitados. La relacion es indexada y tiene **Restrict**: SharePoint impide eliminar una oportunidad mientras tenga documentos relacionados, incluso si se intenta fuera del dashboard. Eliminar un documento elimina su registro y su archivo; no elimina la oportunidad.

1. Pulsa **Documentos** en la oportunidad (tabla o tarjeta), o eligela en el selector del panel documental.
2. Selecciona un archivo y pulsa **Adjuntar documento**. Se admite un archivo por carga y varios documentos por oportunidad, hasta **20 MB por archivo**, sin archivos vacios y con nombres de hasta 180 caracteres.
3. Pulsa el nombre del documento para abrir su revision. El icono de descarga obtiene el archivo con la autenticacion del dashboard.
4. Selecciona Pendiente, Validado o Rechazado, escribe las observaciones y pulsa **Guardar validacion**. Un rechazo requiere motivo. Volver a Pendiente limpia el revisor y la fecha de la revision actual; las versiones anteriores permanecen en SharePoint.
5. **Actualizar documentos** vuelve a leer los archivos y revisiones de la oportunidad seleccionada.

La validacion es **manual**: no analiza automaticamente el contenido, firmas, cumplimiento ni malware. Todo usuario con permisos de edicion sobre la lista puede validar; no se implementa una separacion de roles entre quien carga y quien aprueba. ValidadoPor identifica al usuario desde su sesion, pero no es un campo inmutable: para auditoria usa tambien el editor, la fecha de modificacion y el historial de versiones nativos de SharePoint.

Los documentos se filtran por el ID de la oportunidad. Las revisiones y eliminaciones usan ETag para rechazar cambios concurrentes. Si falla el envio binario, se intenta retirar el registro provisional; si no se puede confirmar esa limpieza, se informa el ID para revisarlo antes de reintentar. Un fallo de refresco posterior a una carga correcta se informa sin sugerir volver a cargar el archivo. Los archivos no se almacenan en localStorage.

No se agregaron permisos a Entra: se utiliza el permiso delegado SharePoint AllSites.Write existente y los permisos del usuario en ambas listas. Al recrear las columnas, usa primero el nombre interno ASCII de la tabla y despues cambia su etiqueta visible; crear directamente etiquetas con espacios o tildes puede generar otros nombres internos.

## Autenticacion para uso local

Iniciar sesion en una pestana de SharePoint no autoriza a una pagina local a consultar el sitio. El dashboard usa MSAL y OAuth con permisos delegados; no requiere ni debe incluir secretos de cliente.

1. En Microsoft Entra, registra una aplicacion de un solo tenant en el directorio indicado arriba.
2. En Autenticacion, agrega la plataforma **Aplicacion de pagina unica (SPA)** y la URI de redireccion `http://localhost:3000/`. Si abres `/index.html`, registra tambien `http://localhost:3000/index.html`.
3. En Permisos de API, agrega **SharePoint > Permisos delegados > AllSites.Write**. El codigo usa la API REST de SharePoint, no Microsoft Graph. Solicita el consentimiento de administrador cuando la politica del tenant lo exija. No habilites concesion implicita ni crees un secreto.
4. El usuario debe tener permisos de lectura y edicion en la lista. El permiso delegado no reemplaza los permisos del usuario. `AllSites.Write` permite actuar en los sitios a los que ese usuario tiene acceso; evalua permisos seleccionados y un despliegue administrado antes de llevar esta demo a produccion.
5. El **ID de aplicacion (cliente)** ya aparece en el dashboard. Pulsa **Conectar SharePoint** y completa el acceso de Microsoft. Si utilizas otro registro, reemplaza el ID antes de conectar.

Registro creado en Entra: **demo-ia-with-copilot-dashboard**. ID de aplicacion (cliente): `41a9e13b-df67-49a3-92a0-ad5d2deae89d`. El dashboard ya lo incluye como valor predeterminado. La redireccion SPA registrada es `http://localhost:3000/`; los flujos implicitos y de cliente publico estan desactivados y no se crearon secretos. El unico permiso de API configurado es SharePoint `AllSites.Write` delegado; se elimino el permiso predeterminado de Graph `User.Read` porque no se utiliza. No se concedio consentimiento global al directorio.

Si el navegador bloquea las ventanas emergentes, el dashboard inicia el acceso por redireccion en la misma pestana y procesa la respuesta al volver. Al recargar, recupera la cuenta activa de la sesion MSAL y vuelve a leer la lista. Se completo el primer acceso OAuth con consentimiento solo para la cuenta conectada, sin marcar el consentimiento en nombre de la organizacion.

## Ejecutar en Windows

Desde la carpeta del repositorio, en PowerShell:

```powershell
.\Start-Dashboard.ps1
```

Abre http://localhost:3000/ y conserva el servidor en ejecucion. El servidor solo escucha en loopback y solo sirve el dashboard, no otros archivos del equipo. No necesita Node.js ni Python. Es exclusivamente para desarrollo local.

En este equipo, la politica de PowerShell impide ejecutar archivos `.ps1`. No se modifico esa politica: para esta sesion se inicio un servidor HTTP equivalente con el runtime incluido en VS Code. El script de PowerShell paso la validacion de sintaxis, pero su ejecucion queda sujeta a la politica del equipo. Para reiniciar el dashboard, usa un servidor HTTP aprobado por tu organizacion si esa restriccion sigue vigente.

Si el puerto esta ocupado, ejecuta `./Start-Dashboard.ps1 -Port 3001`, abre http://localhost:3001/ y registra esa misma URI en Entra. No abras el HTML con `file://`: OAuth necesita un origen HTTP/HTTPS registrado.

Si se integra el codigo en un entorno soportado del mismo origen de SharePoint (por ejemplo, adaptandolo a SPFx), la API puede usar la sesion del sitio y el request digest. Subir este HTML a una biblioteca moderna no garantiza que SharePoint lo ejecute; no es necesario habilitar scripts personalizados ni debilitar la seguridad del sitio para usar la version local.

## Verificacion

Pruebas enfocadas de miembros, herencia, paginacion, ETag y recuperacion de sincronizacion parcial (sin dependencias externas):

```powershell
node --test .\tests\assignment.test.cjs
```

En este equipo, sin Node.js en PATH, se ejecutaron las cinco pruebas con el runtime de VS Code:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "$env:ProgramFiles\Microsoft VS Code\Code.exe" --test --test-isolation=none --test-reporter=spec .\tests\assignment.test.cjs 2>&1 | Out-String
```

Asignacion verificada con SharePoint real: alta desde el formulario, herencia en un nuevo adjunto, reasignacion desde la tabla, archivo descargado con contenido intacto, rechazo 412 de una version antigua y propagacion de un cambio externo al pulsar Actualizar. Se verificaron los selectores en tarjetas a 390 px sin desbordamiento de pagina. La oportunidad y el documento temporales se eliminaron; se conservaron las cinco oportunidades y sus cinco documentos anteriores sin asignar responsables arbitrariamente.

Los datos solo cambian en pantalla despues de una respuesta satisfactoria de SharePoint. Los errores de lectura, permisos y conflictos se muestran sin recurrir a datos simulados. **Actualizar** vuelve a leer la lista. Si se guarda un registro pero falla la lectura posterior, el mensaje distingue ambos resultados para evitar duplicar el alta.

Las dependencias visuales (Tailwind CDN e iconos Lucide) y MSAL se cargan desde Internet. Para produccion, empaqueta las dependencias y usa un despliegue HTTPS administrado.

Verificado en el sitio: alta, lectura con ETag, cambio de estado, rechazo de una version antigua (412) y eliminacion confirmada (404 posterior). Tambien se verificaron las cuatro operaciones reales desde localhost con OAuth usando el registro de Entra creado. Los registros temporales de prueba se eliminaron. En el navegador se probaron ademas las acciones del formulario, los errores de escritura, el guardado con refresco fallido y la paginacion mediante respuestas simuladas.

Documentos verificados con OAuth real: carga desde el formulario, archivo con apostrofe en el nombre, descarga con los mismos bytes, estado inicial Pendiente, revision Validado con cuenta/fecha/observaciones, conflicto 412, aislamiento entre dos oportunidades y restriccion de borrado por relacion. Se eliminaron los archivos, registros documentales y oportunidades temporales. Las pruebas simuladas cubrieron ademas el rechazo sin motivo, la limpieza tras carga fallida y los errores de lectura sin mostrar datos obsoletos. Se comprobo el ancho del panel en movil y la distribucion de listado/revision en escritorio.