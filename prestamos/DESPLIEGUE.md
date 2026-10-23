# Puesta en línea en Oracle Cloud (nivel "Always Free")

Esta guía publica el sistema en una máquina gratuita de Oracle Cloud, con HTTPS automático (Caddy) y la base
de datos sin exponer a internet. Los pasos de la parte 6 en adelante sirven igual en cualquier otro servidor.

## Qué esperar del nivel gratuito (léelo antes de empezar)

- Oracle **redujo en 2026** la máquina ARM gratuita a **2 núcleos y 12 GB de memoria**. Alcanza de sobra para este sistema.
- No hay garantía de servicio. Los términos pueden cambiar, a veces **no hay capacidad** al crear la máquina, y las
  cuentas o máquinas **inactivas pueden ser suspendidas o recuperadas**. Entra a la consola con frecuencia.
- Normalmente piden una **tarjeta** para verificar tu identidad. Mientras no superes los límites gratuitos, no se cobra.
  Verifica las condiciones en pantalla al registrarte, porque cambian.
- **Los respaldos fuera del servidor son obligatorios** (parte 11). Con un servidor gratuito, el riesgo de perderlo es real.
- Para guardar cartera de clientes reales, considera pasar a un servidor de pago de unos USD 6 a 12 al mes.

---

## 1. Ensayo en tu PC (ya lo hiciste; recuérdalo antes de actualizar)

Cuando cambies el sistema, ensáyalo primero con `DOMINIO=localhost` y los puertos 8080/8443 antes de subirlo al servidor.

## 2. Crear la cuenta de Oracle Cloud

1. Regístrate en Oracle Cloud y elige el plan gratuito.
2. Escoge la **región de origen (home region)** con cuidado: **no se puede cambiar después**, y los recursos gratuitos
   viven ahí. Elige una de EE. UU. o Latinoamérica que esté disponible. La capacidad de máquinas ARM varía por región.
3. Guarda el correo y la contraseña en un lugar seguro.

## 3. Crear tu llave de acceso (SSH) en Windows

En PowerShell:

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\prestamos_oracle"
Get-Content "$HOME\.ssh\prestamos_oracle.pub"
```

Pon una frase de paso si quieres. El segundo comando muestra tu llave **pública**: es la que se pega en Oracle.
La privada (`prestamos_oracle`, sin `.pub`) **nunca se comparte**.

## 4. Crear la máquina

En la consola de Oracle: **Compute, Instances, Create instance**.

1. **Nombre:** `prestamos`.
2. **Imagen:** Canonical **Ubuntu 24.04**.
3. **Forma (Shape):** "Change shape", pestaña **Ampere**, `VM.Standard.A1.Flex`, con **2 OCPU y 12 GB**. Debe indicar que es elegible para "Always Free".
4. **Red:** deja la red virtual por defecto y marca **asignar una dirección IPv4 pública**.
5. **Llaves SSH:** elige "Paste public keys" y pega la llave pública de la parte 3.
6. Deja el disco por defecto y pulsa **Create**.

Si aparece el error de **"capacidad de host insuficiente" (out of host capacity)**, no es tu culpa: prueba otro dominio
de disponibilidad si lo hay, o reintenta en otro momento (a veces horas o días).

Cuando la máquina esté en estado **Running**, anota su **IP pública**.

## 5. Abrir los puertos: Oracle tiene DOS cortafuegos

Esta es la causa más común de "mi sitio no abre". Hay que abrirlos en los dos.

**a) En la red de Oracle (Security List).**
En la página de la máquina, entra a su **subred**, luego a **Security Lists**, la lista por defecto, y **Add Ingress Rules**.
Agrega dos reglas: origen `0.0.0.0/0`, protocolo **TCP**, puerto de destino **80**; y otra igual con el puerto **443**.

**b) En el Ubuntu de la máquina (se hace al conectarte, parte 6).** No uses `ufw` aquí: choca con las reglas que
ya trae la imagen de Oracle.

## 6. Conectarte y preparar la máquina

Desde PowerShell, con tu IP:

```powershell
ssh -i "$HOME\.ssh\prestamos_oracle" ubuntu@IP_DE_ORACLE
```

El usuario de estas imágenes es `ubuntu` (no `root`). Ya conectado:

```bash
# Puertos 80 y 443 en el firewall de Ubuntu (iptables)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers
```

En la lista, las dos reglas de los puertos 80 y 443 deben aparecer **antes** de una regla `REJECT`. Si quedaron después,
bórralas (`sudo iptables -D INPUT NUMERO`) y vuelve a insertarlas en una posición menor.
Si `netfilter-persistent` no existe: `sudo apt install -y iptables-persistent`.

Después, Docker y utilidades:

```bash
sudo apt update && sudo apt install -y unzip unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

Cierra la sesión (`exit`) y vuelve a entrar para que el grupo `docker` surta efecto. Comprueba con `docker --version`.
Las imágenes que usa el sistema (Node, PostgreSQL y Caddy) tienen versión ARM, así que no hace falta cambiar nada.

## 7. Apuntar un dominio a la máquina

Caddy necesita un nombre para conseguir el certificado HTTPS. Crea en tu proveedor de dominio un registro **A**
(por ejemplo `cobros.miempresa.com`) que apunte a la **IP pública** de la máquina. Opciones:

- **Comprar un dominio** (unos USD 10 a 15 al año): lo más estable.
- **Un subdominio gratuito** de algún servicio de DNS dinámico: sirve para el piloto, pero **verifica** que el servicio
  siga activo y sus condiciones antes de depender de él.
- **Importante:** la IP pública se mantiene mientras no elimines la máquina. Si piensas recrearla, pregunta en la
  consola por una **IP reservada** (revisa si es gratuita en tu cuenta), para no tener que cambiar el dominio.

## 8. Subir el proyecto

Desde PowerShell, en la carpeta donde está `prestamos.zip`:

```powershell
scp -i "$HOME\.ssh\prestamos_oracle" prestamos.zip ubuntu@IP_DE_ORACLE:~/
```

En la máquina:

```bash
unzip prestamos.zip
cd prestamos
cp .env.prod.example .env.prod
nano .env.prod
```

Completa `.env.prod` (`DOMINIO` sin `https://`, un correo real, y claves aleatorias). Para generarlas:

```bash
openssl rand -hex 24     # para DB_CLAVE
openssl rand -hex 48     # para JWT_SECRET
```

## 9. Encender el sistema

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

La primera construcción en ARM tarda varios minutos. Los tres servicios (`db`, `backend`, `web`) deben quedar `running`.

## 10. Crear la empresa y el administrador

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend npm run crear-empresa -- "Nombre de la empresa" "Tu Nombre" tucorreo@empresa.com "UnaClaveLargaYUnica"
```

Esa contraseña queda en el historial del servidor: cámbiala desde el panel la primera vez que entres
(Usuarios, tu usuario, Restablecer contraseña). Abre `https://TU_DOMINIO`: debe verse el candado y la pantalla de acceso,
y `https://TU_DOMINIO/api/salud` debe responder `{"ok":true}`.

## 11. Respaldos (no te saltes este paso)

Programa un respaldo diario: `crontab -e` y agrega al final:

```
0 8 * * * /home/ubuntu/prestamos/scripts/respaldo.sh >> /home/ubuntu/respaldo.log 2>&1
```

El servidor trabaja en hora UTC: las 08:00 UTC son las 2:00 a. m. en Honduras. Los respaldos quedan en `~/respaldos`
y se conservan 14 días.

**Un respaldo que solo está en la misma máquina se pierde con ella.** Copia los respaldos a otro lugar con `rclone`
(Google Drive, Backblaze, etc.): `sudo apt install -y rclone`, luego `rclone config`, y en el cron antepón la variable:
`RCLONE_DESTINO=minube:respaldos`.

**Prueba la restauración ahora**, con la base todavía sin datos reales:

```bash
./scripts/respaldo.sh
./scripts/restaurar.sh ~/respaldos/prestamos_FECHA.sql.gz
```

## 12. Mantener viva la máquina gratuita

- Entra a la consola de Oracle con regularidad: las cuentas inactivas pueden suspenderse.
- Una guía de la comunidad indica que **pasar la cuenta a "Pay As You Go"** (sigue siendo gratis dentro de los límites)
  evita que Oracle recupere máquinas "inactivas" y facilita conseguir capacidad ARM. Hazlo solo si entiendes que, al
  superar los límites gratuitos, **sí se cobra**: crea un **presupuesto con alerta de costos** en la consola y no crees
  recursos de más. Confirma esta información en la documentación oficial de Oracle antes de decidir.

## 13. Actualizar a una versión nueva

1. Haz un respaldo: `./scripts/respaldo.sh`
2. Sube el nuevo `prestamos.zip` y descomprímelo sobre la carpeta (`unzip -o prestamos.zip`). Tu `.env.prod` no se pierde.
3. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
4. **Migraciones:** los archivos nuevos de `backend/src/db/migrations` NO se aplican solos en una base que ya existe.
   Aplica cada archivo nuevo, una sola vez (ejemplo con el 004):
   ```bash
   cat backend/src/db/migrations/004_nombre.sql | docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
   ```
   No vuelvas a ejecutar `001_esquema_inicial.sql`: fallaría.

## 14. Si algo falla

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 100 web
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 100 backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail 100 db
```

- **El sitio no abre desde fuera:** casi siempre falta abrir un puerto. Revisa los **dos** cortafuegos de la parte 5
  (Security List y `iptables`) y que el dominio apunte a la IP correcta.
- **Error de certificado:** el dominio todavía no apunta a la máquina, o los puertos 80 y 443 están cerrados.
- **El backend se reinicia solo:** casi siempre es `JWT_SECRET` de menos de 32 caracteres o una clave de base mal escrita.
- **No puedes crear la máquina ARM:** reintenta más tarde; es falta de capacidad, no un error tuyo.

## 15. Instalar la app en el teléfono

Cuando el sitio abra con HTTPS, cada persona puede instalarlo como una app:

- **Android (Chrome):** en el panel aparece una tarjeta "Instala Kashfy en tu teléfono" con el botón **Instalar**.
  También sirve el menú de Chrome, "Instalar aplicación".
- **iPhone (Safari):** la tarjeta explica el camino: botón **Compartir**, luego **Añadir a pantalla de inicio**.
  En iPhone solo funciona desde Safari.
- Queda con su ícono, se abre a pantalla completa y carga más rápido.
- **Sin señal** la app abre y muestra un aviso, pero **no guarda cobros ni muestra datos nuevos**: los datos solo
  viajan por internet y nunca se guardan en el teléfono. El modo sin conexión completo es una fase aparte.
- Si cambias el nombre del negocio, edita también `frontend/public/manifest.webmanifest` (nombre de la app) y
  `frontend/public/icono.svg` (el ícono). Los `.png` se regeneran a partir del `.svg`.
- Después de actualizar el sistema, la app se actualiza sola la próxima vez que se abre con conexión.

---

## Lista de verificación antes de usar datos reales

- [ ] El sitio abre con candado (HTTPS) y `https://TU_DOMINIO/api/salud` responde `{"ok":true}`.
- [ ] Entraste con tu usuario y cambiaste la contraseña inicial.
- [ ] Cada persona tiene su propio usuario; nadie comparte cuentas.
- [ ] Hay un respaldo diario, una copia **fuera del servidor** y **ya probaste restaurar**.
- [ ] Solo se entra a la máquina con la llave SSH, y solo están abiertos los puertos 22, 80 y 443.
- [ ] Entras a la consola de Oracle con regularidad y revisas cada semana que existan respaldos recientes.
- [ ] Consultaste con un abogado local el aviso de privacidad y el consentimiento para guardar datos personales y crediticios.

Limitación a tener presente: un solo servidor es un solo punto de falla. Para un piloto es razonable;
la tranquilidad la dan los respaldos externos.
