-- Datos de desarrollo: una empresa y un usuario administrador (ids 1 y 1 en una base nueva)
INSERT INTO empresas (nombre) VALUES ('Empresa Demo');
INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol)
VALUES (1, 'Admin Demo', 'admin@demo.local', 'sin-login-todavia', 'ADMIN');
