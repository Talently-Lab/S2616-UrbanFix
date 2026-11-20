import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3001/api';
const HEALTH_URL = process.env.HEALTH_URL || 'http://127.0.0.1:3001/health';

// Helper HTTP
async function api(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers,
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
    it('GET /health retorna 200 con status ok y timestamp ISO', async () => {
      const res = await api(HEALTH_URL);
      assert.equal(res.status, 200);
      assert.equal(res.data.status, 'ok');
      assert.ok(res.data.timestamp);
      assert.ok(!isNaN(Date.parse(res.data.timestamp)));
    });

    it('GET /api/categorias retorna 200 con lista de categorías válidas', async () => {
      const res = await api('/categorias');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.data.includes('PLOMERIA'));
      assert.ok(res.data.data.includes('ELECTRICIDAD'));
      assert.ok(res.data.data.includes('GAS'));
    });

    it('OPTIONS /api/solicitudes (CORS Preflight) responde 204 con Access-Control-Allow-Origin: *', async () => {
      const res = await fetch(`${API_BASE_URL}/solicitudes`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization'
        }
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), '*');
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
});
