import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import jwt from 'jsonwebtoken';
import {
  loadConfig,
  getJwtConfig,
  validateDatabaseUrl,
  validatePort,
  validateNodeEnv,
  validateJwtSecret,
  validateJwtExpiresIn,
  validateCorsOrigins,
  ConfigError,
  PLACEHOLDER_JWT_SECRET
} from '../../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../..');

const API_BASE_URL = process.env.API_BASE_URL;
const HEALTH_URL = process.env.HEALTH_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// B5: Exigir entorno explícito provisto por el arnés; abortar antes de cualquier HTTP si falta
if (!API_BASE_URL || !HEALTH_URL) {
  console.error('\n❌ ERROR DE SEGURIDAD EN SUITE DE PRUEBAS:');
  console.error('Las variables de entorno API_BASE_URL y HEALTH_URL deben estar explícitamente configuradas por el arnés de pruebas.');
  console.error('Para evitar modificar datos de un entorno de desarrollo local (localhost:3001),');
  console.error('la suite prohíbe fallbacks predeterminados. Ejecute las pruebas mediante "npm test".\n');
  process.exit(1);
}

// Helper HTTP con límites de tiempo acotados (B6)
async function api(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(5000),
    body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
  });
  let data;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  return {
    status: res.status,
    headers: res.headers,
    data
  };
}

describe('UrbanFix Backend - Suite de Integración de API (BE-02)', () => {
  // -------------------------------------------------------------------------
  // 1. Endpoints Públicos y Preflight CORS
  // -------------------------------------------------------------------------
  describe('1. Endpoints Públicos y CORS', () => {
    it('GET /health sin Origin retorna 200 con status ok, timestamp ISO, sin allow-origin y con Vary: Origin', async () => {
      const res = await api(HEALTH_URL);
      assert.equal(res.status, 200);
      assert.equal(res.data.status, 'ok');
      assert.ok(res.data.timestamp);
      assert.ok(!isNaN(Date.parse(res.data.timestamp)));
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin incluso sin Origin');
    });

    it('GET /health con Origin permitido (http://localhost:5173) retorna 200, su origen y Vary: Origin', async () => {
      const res = await fetch(HEALTH_URL, {
        headers: { 'Origin': 'http://localhost:5173' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin');
    });

    it('GET /api/categorias sin Origin retorna 200 con lista de categorías válidas y Vary: Origin', async () => {
      const res = await api('/categorias');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.data.includes('PLOMERIA'));
      assert.ok(res.data.data.includes('ELECTRICIDAD'));
      assert.ok(res.data.data.includes('GAS'));
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin');
    });

    it('GET /api/categorias con segundo Origin permitido (http://127.0.0.1:5173) retorna 200, su origen y Vary: Origin', async () => {
      const res = await fetch(`${API_BASE_URL}/categorias`, {
        headers: { 'Origin': 'http://127.0.0.1:5173' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.data));
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin');
    });

    it('OPTIONS /api/solicitudes (CORS Preflight) con Origin permitido responde 204 con métodos, headers y Vary: Origin', async () => {
      const res = await fetch(`${API_BASE_URL}/solicitudes`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(5000),
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin');
      const allowMethods = res.headers.get('access-control-allow-methods') || '';
      assert.ok(allowMethods.includes('POST'));
      assert.ok(allowMethods.includes('GET'));
      const allowHeaders = res.headers.get('access-control-allow-headers') || '';
      assert.ok(allowHeaders.toLowerCase().includes('authorization'));
      assert.ok(allowHeaders.toLowerCase().includes('content-type'));
    });

    it('Petición con Origin no permitido retorna 403 con CORS_ORIGIN_DENIED, Vary: Origin y sin allow-origin', async () => {
      const res = await fetch(`${API_BASE_URL}/categorias`, {
        headers: { 'Origin': 'https://origen-no-autorizado.com' }
      });
      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin ante origen denegado');
      const data = await res.json();
      assert.equal(data.error.code, 'CORS_ORIGIN_DENIED');
      assert.ok(data.error.message);
    });

    it('Preflight OPTIONS con Origin no permitido retorna 403 con CORS_ORIGIN_DENIED, Vary: Origin y sin allow-origin', async () => {
      const res = await fetch(`${API_BASE_URL}/solicitudes`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://origen-no-autorizado.com',
          'Access-Control-Request-Method': 'POST'
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin ante preflight denegado');
      const data = await res.json();
      assert.equal(data.error.code, 'CORS_ORIGIN_DENIED');
    });

    it('Petición con Origin "null" retorna 403 con CORS_ORIGIN_DENIED, Vary: Origin y sin allow-origin', async () => {
      const res = await fetch(HEALTH_URL, {
        headers: { 'Origin': 'null' }
      });
      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const vary = res.headers.get('vary') || '';
      assert.ok(vary.toLowerCase().includes('origin'), 'Vary debe incluir Origin ante origin null');
      const data = await res.json();
      assert.equal(data.error.code, 'CORS_ORIGIN_DENIED');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Autenticación, Roles y Perfil
  // -------------------------------------------------------------------------
  describe('2. Autenticación, Roles y Perfil', () => {
    it('Login de los 3 roles iniciales sembrados (CLIENTE, TECNICO, ADMIN) no expone passwordHash', async () => {
      const roles = [
        { email: 'juan@mail.com', rol: 'CLIENTE' },
        { email: 'carlos@mail.com', rol: 'TECNICO' },
        { email: 'admin@mail.com', rol: 'ADMIN' }
      ];

      for (const { email, rol } of roles) {
        const res = await api('/auth/login', {
          method: 'POST',
          body: { email, password: 'MinimoOchoCaracteres' }
        });
        assert.equal(res.status, 200, `Login falló para ${email}`);
        assert.ok(res.data.data.token, 'Token debe estar presente');
        const decoded = jwt.decode(res.data.data.token);
        assert.ok(decoded.exp && decoded.iat, 'Token debe contener claims exp e iat');
        assert.equal(decoded.exp - decoded.iat, 604800, 'Expiración debe coincidir con JWT_EXPIRES_IN (7d = 604800s)');
        assert.equal(res.data.data.usuario.email, email);
        assert.equal(res.data.data.usuario.rol, rol);
        assert.equal(res.data.data.usuario.passwordHash, undefined, 'passwordHash nunca debe exponerse');
        assert.ok(res.data.data.usuario.lastLogin, 'lastLogin debe registrarse');
      }
    });

    it('Login con contraseña incorrecta retorna 401 UNAUTHORIZED', async () => {
      const res = await api('/auth/login', {
        method: 'POST',
        body: { email: 'juan@mail.com', password: 'PasswordErroneo123' }
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
      assert.equal(res.data.error.message, 'Credenciales inválidas');
    });

    it('Login con email inexistente retorna 401 UNAUTHORIZED con mensaje idéntico genérico', async () => {
      const res = await api('/auth/login', {
        method: 'POST',
        body: { email: 'no_existe_usuario@mail.com', password: 'MinimoOchoCaracteres' }
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
      assert.equal(res.data.error.message, 'Credenciales inválidas');
    });

    it('Registro público de CLIENTE retorna 201 sin passwordHash', async () => {
      const email = `cliente_${Date.now()}@mail.com`;
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          email,
          password: 'PasswordSeguro123',
          nombre: 'Cliente Nuevo',
          celular: '11223344',
          rol: 'CLIENTE'
        }
      });
      assert.equal(res.status, 201);
      assert.ok(res.data.data.token);
      const decoded = jwt.decode(res.data.data.token);
      assert.ok(decoded.exp && decoded.iat);
      assert.equal(decoded.exp - decoded.iat, 604800);
      assert.equal(res.data.data.usuario.email, email);
      assert.equal(res.data.data.usuario.rol, 'CLIENTE');
      assert.equal(res.data.data.usuario.passwordHash, undefined);
    });

    it('Registro público de TECNICO retorna 201 sin passwordHash', async () => {
      const email = `tecnico_${Date.now()}@mail.com`;
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          email,
          password: 'PasswordSeguro123',
          nombre: 'Tecnico Nuevo',
          celular: '99887766',
          rol: 'TECNICO'
        }
      });
      assert.equal(res.status, 201);
      assert.ok(res.data.data.token);
      const decoded = jwt.decode(res.data.data.token);
      assert.ok(decoded.exp && decoded.iat);
      assert.equal(decoded.exp - decoded.iat, 604800);
      assert.equal(res.data.data.usuario.email, email);
      assert.equal(res.data.data.usuario.rol, 'TECNICO');
      assert.equal(res.data.data.usuario.passwordHash, undefined);
    });

    it('Rechazo de registro con rol ADMIN público retorna 400 VALIDATION_ERROR', async () => {
      const res = await api('/auth/register', {
        method: 'POST',
        body: {
          email: `admin_falso_${Date.now()}@mail.com`,
          password: 'PasswordSeguro123',
          nombre: 'Hacker Admin',
          rol: 'ADMIN'
        }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data.error.code, 'VALIDATION_ERROR');
    });

    it('Registro con correo duplicado retorna 409 CONFLICT', async () => {
      const email = `duplicado_${Date.now()}@mail.com`;
      const first = await api('/auth/register', {
        method: 'POST',
        body: { email, password: 'PasswordSeguro123', nombre: 'Primero' }
      });
      assert.equal(first.status, 201);

      const second = await api('/auth/register', {
        method: 'POST',
        body: { email, password: 'PasswordSeguro123', nombre: 'Segundo' }
      });
      assert.equal(second.status, 409);
      assert.equal(second.data.error.code, 'CONFLICT');
      assert.equal(second.data.error.message, 'Email ya registrado');
    });

    it('Validación de registro rechaza password < 8 caracteres, email inválido y nombre vacío con 400', async () => {
      // Password corta
      const resPass = await api('/auth/register', {
        method: 'POST',
        body: { email: 'valido@mail.com', password: 'corta', nombre: 'Test' }
      });
      assert.equal(resPass.status, 400);
      assert.equal(resPass.data.error.code, 'VALIDATION_ERROR');

      // Email inválido
      const resEmail = await api('/auth/register', {
        method: 'POST',
        body: { email: 'email_invalido_sin_arroba', password: 'PasswordSeguro123', nombre: 'Test' }
      });
      assert.equal(resEmail.status, 400);

      // Nombre vacío
      const resNom = await api('/auth/register', {
        method: 'POST',
        body: { email: 'nombre_vacio@mail.com', password: 'PasswordSeguro123', nombre: '' }
      });
      assert.equal(resNom.status, 400);
    });

    it('GET /api/auth/me sin token retorna 401 UNAUTHORIZED', async () => {
      const res = await api('/auth/me');
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
    });

    it('GET /api/auth/me con token manipulado retorna 401 UNAUTHORIZED', async () => {
      const res = await api('/auth/me', {
        headers: { Authorization: 'Bearer token_invalido_totalmente' }
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
    });

    it('GET /api/auth/me con token expirado retorna 401 UNAUTHORIZED (sin sleeps)', async () => {
      const expiredToken = jwt.sign(
        { id: 'a1111111-1111-1111-1111-111111111111', rol: 'CLIENTE' },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );
      const res = await api('/auth/me', {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
      assert.equal(res.data.error.message, 'Token expirado o inválido');
    });

    it('GET /api/auth/me con token firmado con secreto ajeno retorna 401 UNAUTHORIZED', async () => {
      const foreignToken = jwt.sign(
        { id: 'a1111111-1111-1111-1111-111111111111', rol: 'CLIENTE' },
        'otro_secreto_valido_de_mas_de_32_caracteres_longitud!!'
      );
      const res = await api('/auth/me', {
        headers: { Authorization: `Bearer ${foreignToken}` }
      });
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
      assert.equal(res.data.error.message, 'Token expirado o inválido');
    });

    it('GET /api/auth/me con token válido retorna el perfil sin passwordHash', async () => {
      const loginRes = await api('/auth/login', {
        method: 'POST',
        body: { email: 'juan@mail.com', password: 'MinimoOchoCaracteres' }
      });
      const token = loginRes.data.data.token;

      const res = await api('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.email, 'juan@mail.com');
      assert.equal(res.data.data.passwordHash, undefined);
    });

    it('PATCH /api/usuarios/me actualiza perfil y valida cuerpo no vacío', async () => {
      const reg = await api('/auth/register', {
        method: 'POST',
        body: { email: `me_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Original' }
      });
      const token = reg.data.data.token;

      // Actualizar nombre y celular
      const patchRes = await api('/usuarios/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: { nombre: 'Nombre Modificado', celular: '55443322' }
      });
      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.data.data.nombre, 'Nombre Modificado');
      assert.equal(patchRes.data.data.celular, '55443322');

      // Body vacío debe dar 400
      const emptyRes = await api('/usuarios/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: {}
      });
      assert.equal(emptyRes.status, 400);
      assert.equal(emptyRes.data.error.code, 'VALIDATION_ERROR');

      // Alias /api/users/me funciona igual
      const aliasRes = await api('/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(aliasRes.status, 200);
      assert.equal(aliasRes.data.data.nombre, 'Nombre Modificado');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Aislamiento y Gestión de Solicitudes
  // -------------------------------------------------------------------------
  describe('3. Aislamiento y Gestión de Solicitudes', () => {
    let clientAToken, clientBToken, techToken, adminToken;

    it('Preparar usuarios de prueba para solicitudes', async () => {
      const regA = await api('/auth/register', {
        method: 'POST',
        body: { email: `clienteA_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Cliente A' }
      });
      clientAToken = regA.data.data.token;

      const regB = await api('/auth/register', {
        method: 'POST',
        body: { email: `clienteB_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Cliente B' }
      });
      clientBToken = regB.data.data.token;

      const loginTech = await api('/auth/login', {
        method: 'POST',
        body: { email: 'carlos@mail.com', password: 'MinimoOchoCaracteres' }
      });
      techToken = loginTech.data.data.token;

      const loginAdmin = await api('/auth/login', {
        method: 'POST',
        body: { email: 'admin@mail.com', password: 'MinimoOchoCaracteres' }
      });
      adminToken = loginAdmin.data.data.token;
    });

    it('TECNICO no puede crear solicitudes (403 FORBIDDEN)', async () => {
      const res = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${techToken}` },
        body: {
          titulo: 'Intento de tecnico',
          descripcion: 'No permitido',
          categoria: 'PLOMERIA',
          direccion: 'Calle 1'
        }
      });
      assert.equal(res.status, 403);
      assert.equal(res.data.error.code, 'FORBIDDEN');
    });

    it('CLIENTE crea solicitud y se genera historial inicial atómico', async () => {
      const res = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientAToken}` },
        body: {
          titulo: 'Canilla con goteo',
          descripcion: 'Gotea agua fria en bano',
          categoria: 'PLOMERIA',
          direccion: 'Av Belgrano 100'
        }
      });
      assert.equal(res.status, 201);
      const sol = res.data.data;
      assert.equal(sol.titulo, 'Canilla con goteo');
      assert.equal(sol.estado, 'PENDIENTE');
      assert.equal(sol.tecnicoId, null);
      assert.equal(sol.tecnico, null);
      assert.ok(sol.cliente);
      assert.equal(sol.cliente.nombre, 'Cliente A');

      // Verificar historial inicial
      const histRes = await api(`/solicitudes/${sol.id}/historial`, {
        headers: { Authorization: `Bearer ${clientAToken}` }
      });
      assert.equal(histRes.status, 200);
      assert.equal(histRes.data.data.length, 1);
      assert.equal(histRes.data.data[0].estadoNuevo, 'PENDIENTE');
    });

    it('Aislamiento entre clientes: Cliente B no puede ver ni listar solicitudes de Cliente A', async () => {
      // Cliente A crea solicitud
      const createRes = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientAToken}` },
        body: {
          titulo: 'Solicitud Privada A',
          descripcion: 'Solo Cliente A debe verla',
          categoria: 'GAS',
          direccion: 'Privada 123'
        }
      });
      const idA = createRes.data.data.id;

      // Cliente B lista sus solicitudes: no debe ver idA
      const listB = await api('/solicitudes', {
        headers: { Authorization: `Bearer ${clientBToken}` }
      });
      assert.equal(listB.status, 200);
      const idsB = listB.data.data.map(s => s.id);
      assert.ok(!idsB.includes(idA), 'Cliente B no debe ver la solicitud de Cliente A en su listado');

      // Cliente B intenta ver por ID directo: 403 FORBIDDEN
      const getB = await api(`/solicitudes/${idA}`, {
        headers: { Authorization: `Bearer ${clientBToken}` }
      });
      assert.equal(getB.status, 403);
      assert.equal(getB.data.error.code, 'FORBIDDEN');

      // Cliente B intenta ver historial: 403 FORBIDDEN
      const histB = await api(`/solicitudes/${idA}/historial`, {
        headers: { Authorization: `Bearer ${clientBToken}` }
      });
      assert.equal(histB.status, 403);
    });

    it('Filtro por categoría, paginación y validación de limit > 100', async () => {
      // Crear una en ELECTRICIDAD
      await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientAToken}` },
        body: {
          titulo: 'Enchufe sin corriente',
          descripcion: 'Falla termomagnetica',
          categoria: 'ELECTRICIDAD',
          direccion: 'Calle Sol 456'
        }
      });

      // Filtrar por ELECTRICIDAD
      const resCat = await api('/solicitudes?categoria=ELECTRICIDAD', {
        headers: { Authorization: `Bearer ${clientAToken}` }
      });
      assert.equal(resCat.status, 200);
      assert.ok(resCat.data.data.length >= 1);
      for (const item of resCat.data.data) {
        assert.equal(item.categoria, 'ELECTRICIDAD');
      }

      // Meta de paginación
      const resPage = await api('/solicitudes?page=1&limit=2', {
        headers: { Authorization: `Bearer ${clientAToken}` }
      });
      assert.equal(resPage.status, 200);
      assert.equal(resPage.data.meta.page, 1);
      assert.equal(resPage.data.meta.limit, 2);
      assert.ok(resPage.data.meta.total >= 2);

      // Limit > 100 rechazado con 400
      const resLimit = await api('/solicitudes?limit=101', {
        headers: { Authorization: `Bearer ${clientAToken}` }
      });
      assert.equal(resLimit.status, 400);
      assert.equal(resLimit.data.error.code, 'VALIDATION_ERROR');
    });

    it('Cliente dueño actualiza solicitud PENDIENTE; otro cliente es rechazado con 403', async () => {
      const createRes = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientAToken}` },
        body: {
          titulo: 'Titulo antes de editar',
          descripcion: 'Desc anterior',
          categoria: 'PINTURA',
          direccion: 'Calle 10'
        }
      });
      const solId = createRes.data.data.id;

      // Actualizar por dueño
      const updateRes = await api(`/solicitudes/${solId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientAToken}` },
        body: { descripcion: 'Desc actualizada y detallada' }
      });
      assert.equal(updateRes.status, 200);
      assert.equal(updateRes.data.data.descripcion, 'Desc actualizada y detallada');

      // Actualizar por otro cliente: 403
      const hackRes = await api(`/solicitudes/${solId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientBToken}` },
        body: { descripcion: 'Intento de modificar ajeno' }
      });
      assert.equal(hackRes.status, 403);
      assert.equal(hackRes.data.error.code, 'FORBIDDEN');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Bolsa de Técnicos, Rechazo, Concurrencia y Transiciones de Estado
  // -------------------------------------------------------------------------
  describe('4. Rechazos, Concurrencia y Ciclo de Vida', () => {
    let clientToken, tech1Token, tech2Token, adminToken;
    let tech1Id, tech2Id;

    it('Preparar dos técnicos y un cliente para pruebas de flujo y concurrencia', async () => {
      const c = await api('/auth/register', {
        method: 'POST',
        body: { email: `cliente_flujo_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Cliente Flujo' }
      });
      clientToken = c.data.data.token;

      const t1 = await api('/auth/register', {
        method: 'POST',
        body: { email: `tec1_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Tecnico Uno', rol: 'TECNICO' }
      });
      tech1Token = t1.data.data.token;
      tech1Id = t1.data.data.usuario.id;

      const t2 = await api('/auth/register', {
        method: 'POST',
        body: { email: `tec2_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Tecnico Dos', rol: 'TECNICO' }
      });
      tech2Token = t2.data.data.token;
      tech2Id = t2.data.data.usuario.id;

      const adm = await api('/auth/login', {
        method: 'POST',
        body: { email: 'admin@mail.com', password: 'MinimoOchoCaracteres' }
      });
      adminToken = adm.data.data.token;
    });

    it('Flujo de rechazo de técnico: motivo requerido, exclusión de bolsa, 403 en detalle y privacidad de historial', async () => {
      // Cliente crea solicitud
      const cRes = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: {
          titulo: 'Solicitud para rechazo',
          descripcion: 'Prueba de rechazo',
          categoria: 'CERRAJERIA',
          direccion: 'Puerta Principal'
        }
      });
      const solId = cRes.data.data.id;

      // Rechazo sin motivo -> 400
      const resSinMotivo = await api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: {}
      });
      assert.equal(resSinMotivo.status, 400);

      // Tecnico 1 rechaza con motivo -> 200
      const resRechazo = await api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: { motivo: 'Fuera de zona de cobertura' }
      });
      assert.equal(resRechazo.status, 200);
      assert.equal(resRechazo.data.data.estado, 'PENDIENTE', 'Sigue PENDIENTE para la bolsa');

      // La solicitud ya NO aparece en la bolsa del Tecnico 1
      const listTech1 = await api('/solicitudes?estado=PENDIENTE', {
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(listTech1.status, 200);
      const idsTech1 = listTech1.data.data.map(s => s.id);
      assert.ok(!idsTech1.includes(solId), 'No debe aparecer en pendientes de Tecnico 1 tras rechazar');

      // SÍ aparece en la bolsa del Tecnico 2
      const listTech2 = await api('/solicitudes?estado=PENDIENTE', {
        headers: { Authorization: `Bearer ${tech2Token}` }
      });
      const idsTech2 = listTech2.data.data.map(s => s.id);
      assert.ok(idsTech2.includes(solId), 'Debe seguir visible para otros técnicos');

      // Tecnico 1 no puede ver el detalle tras rechazar: 403 FORBIDDEN
      const getRechazado = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(getRechazado.status, 403);

      // Rechazo duplicado por Tecnico 1 -> 409 CONFLICT
      const rechazoDup = await api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: { motivo: 'Rechazo otra vez' }
      });
      assert.equal(rechazoDup.status, 409);
      assert.equal(rechazoDup.data.error.code, 'CONFLICT');

      // Tecnico 1 intenta aceptar tras rechazar -> 409 CONFLICT
      const aceptarTrasRechazo = await api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(aceptarTrasRechazo.status, 409);
      assert.equal(aceptarTrasRechazo.data.error.code, 'CONFLICT');

      // Privacidad del historial para el Cliente: NO debe ver la acción RECHAZO
      const histClient = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${clientToken}` }
      });
      assert.equal(histClient.status, 200);
      const rechazosEnCliente = histClient.data.data.filter(h => h.accion === 'RECHAZO');
      assert.equal(rechazosEnCliente.length, 0, 'El cliente NO debe ver registros de rechazos individuales de técnicos');

      // Historial para el ADMIN: SÍ debe ver el registro de RECHAZO con su motivo
      const histAdmin = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(histAdmin.status, 200);
      const rechazosEnAdmin = histAdmin.data.data.filter(h => h.accion === 'RECHAZO');
      assert.equal(rechazosEnAdmin.length, 1);
      assert.equal(rechazosEnAdmin[0].motivo, 'Fuera de zona de cobertura');
    });

    it('Aceptación simultánea (Carrera de concurrencia KAN-216): exactamente un 200 y el resto 409 CONFLICT', async () => {
      // Cliente crea una solicitud PENDIENTE
      const cRes = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: {
          titulo: 'Solicitud de alta demanda',
          descripcion: 'Dos tecnicos intentan tomarla a la vez',
          categoria: 'PLOMERIA',
          direccion: 'Centro 777'
        }
      });
      const solId = cRes.data.data.id;

      // Ejecutar dos peticiones de aceptación estrictamente simultáneas
      const [res1, res2] = await Promise.all([
        api(`/solicitudes/${solId}/aceptar`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tech1Token}` }
        }),
        api(`/solicitudes/${solId}/aceptar`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${tech2Token}` }
        })
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 409], 'Exactamente uno debe ganar (200) y el otro tener conflicto (409)');

      const winnerRes = res1.status === 200 ? res1 : res2;
      const loserRes = res1.status === 409 ? res1 : res2;

      assert.equal(winnerRes.data.data.estado, 'ACEPTADA');
      assert.ok(winnerRes.data.data.fechaAceptacion);
      assert.equal(loserRes.data.error.code, 'CONFLICT');
      assert.ok(loserRes.data.error.message.includes('otro técnico') || loserRes.data.error.message.includes('ya fue tomada'));

      // Verificar que el cliente al consultar la solicitud ve los datos del técnico ganador
      const solPost = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${clientToken}` }
      });
      assert.equal(solPost.status, 200);
      assert.ok(solPost.data.data.tecnico);
      assert.ok(solPost.data.data.tecnico.id === tech1Id || solPost.data.data.tecnico.id === tech2Id);
      assert.ok(solPost.data.data.tecnico.nombre);
    });

    it('Ciclo de vida completo: PENDIENTE -> ACEPTADA -> EN_PROCESO -> FINALIZADA y transiciones ilegales', async () => {
      // Crear nueva solicitud
      const cRes = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: {
          titulo: 'Pintura comedor',
          descripcion: 'Paredes y techo',
          categoria: 'PINTURA',
          direccion: 'Belgrano 500'
        }
      });
      const solId = cRes.data.data.id;

      // Tecnico 1 acepta
      const aRes = await api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(aRes.status, 200);
      assert.equal(aRes.data.data.estado, 'ACEPTADA');

      // Tecnico 2 (no asignado) intenta iniciar -> 403 FORBIDDEN
      const failStart = await api(`/solicitudes/${solId}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech2Token}` }
      });
      assert.equal(failStart.status, 403);
      assert.equal(failStart.data.error.code, 'FORBIDDEN');

      // Tecnico asignado intenta finalizar directamente desde ACEPTADA -> 409 CONFLICT
      const failFinish = await api(`/solicitudes/${solId}/finalizar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(failFinish.status, 409);
      assert.equal(failFinish.data.error.code, 'CONFLICT');

      // Tecnico asignado inicia -> 200 EN_PROCESO
      const startRes = await api(`/solicitudes/${solId}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(startRes.status, 200);
      assert.equal(startRes.data.data.estado, 'EN_PROCESO');
      assert.ok(startRes.data.data.fechaInicio);

      // Cliente dueño no puede editar mientras está EN_PROCESO -> 409 CONFLICT
      const clientEditFail = await api(`/solicitudes/${solId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { descripcion: 'Intento de editar en proceso' }
      });
      assert.equal(clientEditFail.status, 409);

      // Tecnico asignado finaliza -> 200 FINALIZADA
      const finishRes = await api(`/solicitudes/${solId}/finalizar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(finishRes.status, 200);
      assert.equal(finishRes.data.data.estado, 'FINALIZADA');
      assert.ok(finishRes.data.data.fechaFinalizacion);

      // Intentar iniciar cuando ya está FINALIZADA -> 409 CONFLICT
      const reStart = await api(`/solicitudes/${solId}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      assert.equal(reStart.status, 409);

      // Verificar historial completo con las 4 etapas ordenadas cronológicamente
      const fullHist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${clientToken}` }
      });
      assert.equal(fullHist.status, 200);
      const states = fullHist.data.data.map(h => h.estadoNuevo);
      assert.deepEqual(states, ['PENDIENTE', 'ACEPTADA', 'EN_PROCESO', 'FINALIZADA']);
    });

    it('Cancelación de solicitud: permitida en PENDIENTE y ACEPTADA; prohibida en EN_PROCESO o por técnico', async () => {
      // 1. Cancelar en PENDIENTE
      const s1 = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { titulo: 'Para cancelar 1', descripcion: 'D', categoria: 'GAS', direccion: 'Dir' }
      });
      const id1 = s1.data.data.id;

      const cancel1 = await api(`/solicitudes/${id1}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Ya no necesito el servicio' }
      });
      assert.equal(cancel1.status, 200);
      assert.equal(cancel1.data.data.estado, 'CANCELADA');
      assert.equal(cancel1.data.data.motivoCancelacion, 'Ya no necesito el servicio');

      // 2. Cancelar en ACEPTADA
      const s2 = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { titulo: 'Para cancelar 2', descripcion: 'D', categoria: 'GAS', direccion: 'Dir' }
      });
      const id2 = s2.data.data.id;
      await api(`/solicitudes/${id2}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      // Tecnico intenta cancelar -> 403 FORBIDDEN
      const techCancel = await api(`/solicitudes/${id2}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: { motivo: 'No quiero ir' }
      });
      assert.equal(techCancel.status, 403);

      // Cliente dueño cancela en ACEPTADA -> 200
      const clientCancelAceptada = await api(`/solicitudes/${id2}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Urgencia resuelta por otro medio' }
      });
      assert.equal(clientCancelAceptada.status, 200);
      assert.equal(clientCancelAceptada.data.data.estado, 'CANCELADA');

      // 3. Prohibido cancelar en EN_PROCESO
      const s3 = await api('/solicitudes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { titulo: 'Para cancelar 3', descripcion: 'D', categoria: 'GAS', direccion: 'Dir' }
      });
      const id3 = s3.data.data.id;
      await api(`/solicitudes/${id3}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      await api(`/solicitudes/${id3}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      const cancelEnProceso = await api(`/solicitudes/${id3}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Cancelar en proceso' }
      });
      assert.equal(cancelEnProceso.status, 409);
      assert.equal(cancelEnProceso.data.error.code, 'CONFLICT');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Panel de Administrador y Gestión de Usuarios
  // -------------------------------------------------------------------------
  describe('5. Administrador y Gestión de Usuarios', () => {
    let adminToken, clientToken;

    it('Preparar tokens para módulo de administración', async () => {
      const a = await api('/auth/login', {
        method: 'POST',
        body: { email: 'admin@mail.com', password: 'MinimoOchoCaracteres' }
      });
      adminToken = a.data.data.token;

      const c = await api('/auth/login', {
        method: 'POST',
        body: { email: 'juan@mail.com', password: 'MinimoOchoCaracteres' }
      });
      clientToken = c.data.data.token;
    });

    it('GET /api/admin/usuarios requiere rol ADMIN (403 para CLIENTE)', async () => {
      const res = await api('/admin/usuarios', {
        headers: { Authorization: `Bearer ${clientToken}` }
      });
      assert.equal(res.status, 403);
      assert.equal(res.data.error.code, 'FORBIDDEN');
    });

    it('GET /api/admin/usuarios retorna listado paginado y NUNCA expone passwordHash', async () => {
      const res = await api('/admin/usuarios', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.data.length >= 3);
      assert.ok(res.data.meta);
      assert.ok(res.data.meta.total >= 3);

      for (const u of res.data.data) {
        assert.equal(u.passwordHash, undefined, `Usuario ${u.email} no debe incluir passwordHash`);
        assert.ok(u.id);
        assert.ok(u.email);
        assert.ok(u.rol);
      }
    });

    it('PATCH /api/admin/usuarios/:id actualiza usuario y maneja errores 400 y 404', async () => {
      // Crear un usuario temporal
      const reg = await api('/auth/register', {
        method: 'POST',
        body: { email: `update_adm_${Date.now()}@mail.com`, password: 'Password123', nombre: 'Admin Target' }
      });
      const userId = reg.data.data.usuario.id;

      // Actualizar rol a TECNICO
      const patchRes = await api(`/admin/usuarios/${userId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { rol: 'TECNICO', celular: '99001122' }
      });
      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.data.data.rol, 'TECNICO');
      assert.equal(patchRes.data.data.celular, '99001122');

      // Body vacío -> 400
      const emptyRes = await api(`/admin/usuarios/${userId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {}
      });
      assert.equal(emptyRes.status, 400);

      // Usuario inexistente -> 404
      const notFoundRes = await api('/admin/usuarios/00000000-0000-0000-0000-000000000000', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { nombre: 'Inexistente' }
      });
      assert.equal(notFoundRes.status, 404);
    });

    it('ADMIN puede filtrar todas las solicitudes por estado', async () => {
      const res = await api('/solicitudes?estado=CANCELADA', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      for (const sol of res.data.data) {
        assert.equal(sol.estado, 'CANCELADA');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. Validación de Configuración y Aborto de Startup (BE-03)
  // -------------------------------------------------------------------------
  describe('8. Validación de Configuración y Aborto de Startup (BE-03)', () => {
    function runStartup(envOverrides = {}, options = {}) {
      const baseValidEnv = {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        PORT: '39999',
        DATABASE_URL: 'postgresql://testuser:testpass@localhost:5432/testdb?schema=public',
        JWT_SECRET: 'secreto_valido_de_prueba_de_mas_de_32_caracteres_longitud',
        JWT_EXPIRES_IN: '7d',
        CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173'
      };

      const finalEnv = { ...baseValidEnv, ...envOverrides };
      for (const [k, v] of Object.entries(finalEnv)) {
        if (v === undefined) {
          delete finalEnv[k];
        }
      }

      // C2: Aislar cwd en directorio temporal sin .env para evitar contaminación de cargas dotenv
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-startup-isolated-'));
      const entrypoint = path.join(backendRoot, 'src/index.js');
      try {
        return spawnSync('node', [entrypoint], {
          cwd: options.cwd || tempDir,
          env: finalEnv,
          encoding: 'utf-8',
          timeout: 8000
        });
      } finally {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
      }
    }

    // 8.1 JWT_SECRET
    it('Startup aborta con 1 si JWT_SECRET está ausente', () => {
      const res = runStartup({ JWT_SECRET: undefined });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('JWT_SECRET'));
    });

    it('Startup aborta con 1 si JWT_SECRET usa el placeholder de ejemplo', () => {
      const res = runStartup({ JWT_SECRET: PLACEHOLDER_JWT_SECRET });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('JWT_SECRET'));
    });

    it('Startup aborta con 1 si JWT_SECRET tiene menos de 32 caracteres y no filtra el secreto', () => {
      const shortSecret = 'secreto_corto_12345';
      const res = runStartup({ JWT_SECRET: shortSecret });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('JWT_SECRET'));
      assert.equal(res.stderr.includes(shortSecret), false, 'No debe filtrar el valor del secreto');
    });

    // 8.2 DATABASE_URL
    it('Startup aborta con 1 si DATABASE_URL está ausente', () => {
      const res = runStartup({ DATABASE_URL: undefined });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('DATABASE_URL'));
    });

    it('Startup aborta con 1 si DATABASE_URL tiene protocolo no postgres/postgresql y no filtra credenciales', () => {
      const invalidUrl = 'mysql://usuario:claveSecreta@localhost:3306/db';
      const res = runStartup({ DATABASE_URL: invalidUrl });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('DATABASE_URL'));
      assert.equal(res.stderr.includes('claveSecreta'), false, 'No debe filtrar credenciales de base');
    });

    it('Startup aborta con 1 si DATABASE_URL carece de host', () => {
      const res = runStartup({ DATABASE_URL: 'postgresql:///solobasededatos' });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('DATABASE_URL'));
    });

    it('Startup aborta con 1 si DATABASE_URL carece de nombre de base de datos', () => {
      const res = runStartup({ DATABASE_URL: 'postgresql://localhost/' });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('DATABASE_URL'));
    });

    // 8.3 PORT
    it('Startup aborta con 1 si PORT es no numérico o fuera de rango', () => {
      const resAlpha = runStartup({ PORT: 'puerto_invalido' });
      assert.equal(resAlpha.status, 1);
      assert.ok(resAlpha.stderr.includes('PORT'));

      const resZero = runStartup({ PORT: '0' });
      assert.equal(resZero.status, 1);
      assert.ok(resZero.stderr.includes('PORT'));

      const resHigh = runStartup({ PORT: '70000' });
      assert.equal(resHigh.status, 1);
      assert.ok(resHigh.stderr.includes('PORT'));

      const resFloat = runStartup({ PORT: '3001.5' });
      assert.equal(resFloat.status, 1);
      assert.ok(resFloat.stderr.includes('PORT'));
    });

    // 8.4 JWT_EXPIRES_IN
    it('Startup aborta con 1 si JWT_EXPIRES_IN es entero sin unidad explícita', () => {
      const res = runStartup({ JWT_EXPIRES_IN: '3600' });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('JWT_EXPIRES_IN'));
    });

    it('Startup aborta con 1 si JWT_EXPIRES_IN tiene unidad desconocida, 0s o overflow', () => {
      const resUnit = runStartup({ JWT_EXPIRES_IN: '10x' });
      assert.equal(resUnit.status, 1);
      assert.ok(resUnit.stderr.includes('JWT_EXPIRES_IN'));

      const resZero = runStartup({ JWT_EXPIRES_IN: '0s' });
      assert.equal(resZero.status, 1);
      assert.ok(resZero.stderr.includes('JWT_EXPIRES_IN'));

      const resNeg = runStartup({ JWT_EXPIRES_IN: '-5m' });
      assert.equal(resNeg.status, 1);
      assert.ok(resNeg.stderr.includes('JWT_EXPIRES_IN'));

      const resOverflow = runStartup({ JWT_EXPIRES_IN: '9999999999999999999999999d' });
      assert.equal(resOverflow.status, 1);
      assert.ok(resOverflow.stderr.includes('JWT_EXPIRES_IN'));
    });

    // 8.5 NODE_ENV y CORS_ORIGINS
    it('Startup aborta con 1 si NODE_ENV tiene valor no permitido', () => {
      const res = runStartup({ NODE_ENV: 'staging' });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('NODE_ENV'));
    });

    it('Startup aborta con 1 en production si CORS_ORIGINS está ausente o vacío', () => {
      const res = runStartup({ NODE_ENV: 'production', CORS_ORIGINS: undefined });
      assert.equal(res.status, 1);
      assert.ok(res.stderr.includes('CORS_ORIGINS'));

      const resEmpty = runStartup({ NODE_ENV: 'production', CORS_ORIGINS: '   ' });
      assert.equal(resEmpty.status, 1);
      assert.ok(resEmpty.stderr.includes('CORS_ORIGINS'));
    });

    it('Startup aborta con 1 si CORS_ORIGINS incluye "*", "null", path o query', () => {
      const resWildcard = runStartup({ CORS_ORIGINS: '*' });
      assert.equal(resWildcard.status, 1);
      assert.ok(resWildcard.stderr.includes('CORS_ORIGINS'));

      const resNull = runStartup({ CORS_ORIGINS: 'null' });
      assert.equal(resNull.status, 1);
      assert.ok(resNull.stderr.includes('CORS_ORIGINS'));

      const resPath = runStartup({ CORS_ORIGINS: 'http://localhost:5173/api' });
      assert.equal(resPath.status, 1);
      assert.ok(resPath.stderr.includes('CORS_ORIGINS'));

      const resQuery = runStartup({ CORS_ORIGINS: 'http://localhost:5173?param=1' });
      assert.equal(resQuery.status, 1);
      assert.ok(resQuery.stderr.includes('CORS_ORIGINS'));
    });

    // 8.6 Validadores puros de configuración (sin sockets ni conexión a DB)
    it('validateJwtExpiresIn calcula segundos exactos para s, m, h, d', () => {
      assert.equal(validateJwtExpiresIn('30s').seconds, 30);
      assert.equal(validateJwtExpiresIn('15m').seconds, 900);
      assert.equal(validateJwtExpiresIn('2h').seconds, 7200);
      assert.equal(validateJwtExpiresIn('7d').seconds, 604800);
      assert.equal(validateJwtExpiresIn(undefined).seconds, 604800);
    });

    it('validateCorsOrigins normaliza orígenes y admite default en desarrollo', () => {
      const devDefaults = validateCorsOrigins(undefined, 'development');
      assert.deepEqual(devDefaults, ['http://localhost:5173', 'http://127.0.0.1:5173']);

      const testDefaults = validateCorsOrigins('', 'test');
      assert.deepEqual(testDefaults, ['http://localhost:5173', 'http://127.0.0.1:5173']);

      const normalized = validateCorsOrigins('https://mi-dominio.com/, http://localhost:3000', 'production');
      assert.deepEqual(normalized, ['https://mi-dominio.com', 'http://localhost:3000']);
    });

    it('getJwtConfig permite inicializar auth aislada sin requerir PORT ni DATABASE_URL', () => {
      const validSecret = 'secreto_super_valido_de_mas_de_32_caracteres_123';
      const jwtCfg = getJwtConfig({ JWT_SECRET: validSecret, JWT_EXPIRES_IN: '1h' });
      assert.equal(jwtCfg.secret, validSecret);
      assert.equal(jwtCfg.expiresIn, '1h');
      assert.equal(jwtCfg.expiresInSeconds, 3600);
    });

    it('loadConfig recopila múltiples errores si faltan varias variables requeridas', () => {
      assert.throws(() => {
        loadConfig({});
      }, (err) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes('DATABASE_URL'));
        assert.ok(err.message.includes('JWT_SECRET'));
        return true;
      });
    });

    // 8.7 C1: Regresión de no filtración de credenciales / query / fragmentos en CORS_ORIGINS
    it('C1: validateCorsOrigins y startup nunca filtran contraseñas de URL en mensajes de error', () => {
      const probePass = 'probe_secret_password_998877';
      const probeUser = 'probe_user_112233';
      const corsWithCreds = `https://${probeUser}:${probePass}@example.org`;

      assert.throws(() => {
        validateCorsOrigins(corsWithCreds, 'production');
      }, (err) => {
        assert.ok(err instanceof ConfigError);
        assert.equal(err.message.includes(probePass), false, 'Error no debe contener la contraseña');
        assert.equal(err.message.includes(probeUser), false, 'Error no debe contener el usuario');
        assert.ok(err.message.includes('credenciales'));
        assert.ok(err.message.includes('CORS_ORIGINS'));
        return true;
      });

      const resStartup = runStartup({ CORS_ORIGINS: corsWithCreds });
      assert.equal(resStartup.status, 1);
      assert.equal(resStartup.stderr.includes(probePass), false, 'stderr no debe contener la contraseña');
      assert.equal(resStartup.stderr.includes(probeUser), false, 'stderr no debe contener el usuario');
      assert.ok(resStartup.stderr.includes('CORS_ORIGINS'));
    });

    it('C1: validateCorsOrigins y startup nunca filtran parámetros query o fragmentos hash', () => {
      const queryToken = 'super_secret_query_token_xyz99';
      const hashToken = 'super_secret_hash_token_abc88';

      assert.throws(() => {
        validateCorsOrigins(`https://example.org?token=${queryToken}`, 'production');
      }, (err) => {
        assert.equal(err.message.includes(queryToken), false, 'Error no debe contener query params');
        assert.ok(err.message.includes('query'));
        return true;
      });

      assert.throws(() => {
        validateCorsOrigins(`https://example.org#token=${hashToken}`, 'production');
      }, (err) => {
        assert.equal(err.message.includes(hashToken), false, 'Error no debe contener hash fragment');
        assert.ok(err.message.includes('hash'));
        return true;
      });

      const brokenUrlWithMarker = 'not_a_valid_url_with_secret_marker_1234';
      assert.throws(() => {
        validateCorsOrigins(brokenUrlWithMarker, 'production');
      }, (err) => {
        assert.equal(err.message.includes('secret_marker_1234'), false, 'Error no debe interpolar URL rota sensible');
        assert.ok(err.message.includes('no es una URL válida'));
        return true;
      });
    });

    // 8.8 C2: Aislamiento ante existencia de archivo .env del usuario con valores centinela
    it('C2: Pruebas de variables ausentes no heredan .env externo de cwd', () => {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-sentinel-env-'));
      try {
        fs.writeFileSync(
          path.join(fixtureDir, '.env'),
          [
            'JWT_SECRET="secreto_centinela_en_archivo_dotenv_de_mas_de_32_chars"',
            'DATABASE_URL="postgresql://sentinel_user:sentinel_pass@127.0.0.1:5432/sentinel_db_should_never_be_touched"',
            'CORS_ORIGINS="http://localhost:5173"'
          ].join('\n')
        );

        // Cuando la sonda se ejecuta en un directorio aislado (sin .env), la ausencia de JWT_SECRET aborta
        const resIsolated = runStartup({ JWT_SECRET: undefined });
        assert.equal(resIsolated.status, 1);
        assert.ok(resIsolated.stderr.includes('JWT_SECRET'));
      } finally {
        try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch (_) {}
      }
    });

    it('C2: Entorno explícito del harness no es sobrescrito por archivo .env de usuario (sentinel)', () => {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-sentinel-harness-'));
      try {
        const sentinelDb = 'postgresql://sentinel_user:sentinel_pass@127.0.0.1:5432/sentinel_db_should_never_be_touched';
        fs.writeFileSync(
          path.join(fixtureDir, '.env'),
          `DATABASE_URL="${sentinelDb}"\n`
        );

        // Si process.env ya tiene DATABASE_URL (como inyecta el harness), dotenv NO la sobrescribe
        const explicitHarnessDb = 'postgresql://harness_override:harness_pass@127.0.0.1:5432/harness_db?schema=public';
        const res = runStartup(
          { DATABASE_URL: explicitHarnessDb, PORT: 'invalid_port_to_abort_safely' },
          { cwd: fixtureDir }
        );
        // Aborta por PORT inválido, lo que demuestra que parseó el entorno y no tocó la base
        assert.equal(res.status, 1);
        assert.ok(res.stderr.includes('PORT'));
        assert.equal(res.stderr.includes('sentinel_db_should_never_be_touched'), false);
      } finally {
        try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch (_) {}
      }
    });

    it('D1: concurrency.test.js aborta antes de HTTP o PG si DATABASE_URL está ausente, vacía o whitespace', async () => {
      const net = await import('node:net');
      const http = await import('node:http');

      let tcpConnections = 0;
      let httpRequests = 0;

      const tcpServer = net.createServer((socket) => {
        tcpConnections++;
        socket.destroy();
      });
      await new Promise((resolve) => tcpServer.listen(0, '127.0.0.1', resolve));
      const tcpPort = tcpServer.address().port;

      const httpServer = http.createServer((req, res) => {
        httpRequests++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      });
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const httpPort = httpServer.address().port;

      const concurrencyTestPath = path.join(backendRoot, 'tests/api/concurrency.test.js');

      try {
        const testCases = [
          { name: 'ausente', dbUrl: undefined },
          { name: 'vacía', dbUrl: '' },
          { name: 'whitespace', dbUrl: '   \t  \n ' }
        ];

        for (const tc of testCases) {
          const env = {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            API_BASE_URL: `http://127.0.0.1:${httpPort}/api`,
            HEALTH_URL: `http://127.0.0.1:${httpPort}/health`,
            PGHOST: '127.0.0.1',
            PGPORT: String(tcpPort),
            PGUSER: 'sentinel_user',
            PGDATABASE: 'sentinel_db'
          };
          if (tc.dbUrl !== undefined) {
            env.DATABASE_URL = tc.dbUrl;
          }

          const res = spawnSync('node', [concurrencyTestPath], {
            cwd: backendRoot,
            env,
            encoding: 'utf-8',
            timeout: 5000
          });

          assert.notEqual(res.status, 0, `Caso ${tc.name} debe salir con código no cero`);
          assert.ok(
            res.stderr.includes('DATABASE_URL'),
            `Caso ${tc.name} debe reportar DATABASE_URL en stderr`
          );
          assert.equal(
            res.stderr.includes('sentinel_db'),
            false,
            `Caso ${tc.name} no debe imprimir valores sensibles en stderr`
          );
        }

        assert.equal(tcpConnections, 0, 'No debe haber conexiones a sentinel PG*');
        assert.equal(httpRequests, 0, 'No debe haber requests a endpoints HTTP sentinela');
      } finally {
        await new Promise((resolve) => tcpServer.close(resolve));
        await new Promise((resolve) => httpServer.close(resolve));
      }
    });
  });
});
