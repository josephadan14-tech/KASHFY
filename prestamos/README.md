# Sistema de Préstamos

Carpetas: `backend/` (API + motor financiero) y `frontend/` (panel web).

## Base de datos (Docker)
```bash
docker compose up -d
```
El esquema se carga solo la primera vez. Puerto en tu PC: 5434.
Datos de desarrollo: `Get-Content backend\src\db\seed_dev.sql | docker exec -i prestamos-db-1 psql -U prestamos -d prestamos`

## Migraciones nuevas (si ya tenías la base creada)
El esquema inicial solo se carga al crear la base. Para aplicar cambios posteriores a una base existente:
```powershell
Get-Content backend\src\db\migrations\002_anulacion_pagos.sql | docker exec -i prestamos-db-1 psql -U prestamos -d prestamos
```
Y para las rutas de cobro y los arqueos:
```powershell
Get-Content backend\src\db\migrations\003_rutas_y_arqueos.sql | docker exec -i prestamos-db-1 psql -U prestamos -d prestamos
```

## API
```bash
cd backend
npm install
# copia .env.example como .env y completa DATABASE_URL y JWT_SECRET
npm run set-password -- admin@demo.local TuClaveSegura123
npm run dev          # http://localhost:3000
npm test
```

## Panel web
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (con el API encendido)
```

## Puesta en línea
Ver `DESPLIEGUE.md`: guía paso a paso para Oracle Cloud (nivel gratuito), con HTTPS, respaldos y lista de verificación.
