import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Client } = pg;
const API_BASE_URL = process.env.API_BASE_URL;
const HEALTH_URL = process.env.HEALTH_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!API_BASE_URL || !HEALTH_URL) {
  console.error('\n❌ ERROR: API_BASE_URL y HEALTH_URL requeridos por el arnés.');
  process.exit(1);
}

async function api(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(10000),
    body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
  });
  let data;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

describe('UrbanFix Backend - Suite de Concurrencia y Transiciones (BE-04)', () => {
  let clientToken, tech1Token, tech2Token, tech3Token, adminToken;
  let clientId, tech1Id, tech2Id, tech3Id;

  it('Preparar usuarios de prueba aislados para concurrencia', async () => {
    const runId = Math.random().toString(36).substring(2, 9);

    const cRes = await api('/auth/register', {
      method: 'POST',
      body: { email: `cli_${runId}@conc.com`, password: 'MinimoOchoCaracteres', nombre: 'Cliente Concurrencia', rol: 'CLIENTE' }
    });
    assert.equal(cRes.status, 201);
    clientToken = cRes.data.data.token;
    clientId = cRes.data.data.usuario.id;

    const t1Res = await api('/auth/register', {
      method: 'POST',
      body: { email: `t1_${runId}@conc.com`, password: 'MinimoOchoCaracteres', nombre: 'Tech 1 Concurrencia', rol: 'TECNICO' }
    });
    assert.equal(t1Res.status, 201);
    tech1Token = t1Res.data.data.token;
    tech1Id = t1Res.data.data.usuario.id;

    const t2Res = await api('/auth/register', {
      method: 'POST',
      body: { email: `t2_${runId}@conc.com`, password: 'MinimoOchoCaracteres', nombre: 'Tech 2 Concurrencia', rol: 'TECNICO' }
    });
    assert.equal(t2Res.status, 201);
    tech2Token = t2Res.data.data.token;
    tech2Id = t2Res.data.data.usuario.id;

    const t3Res = await api('/auth/register', {
      method: 'POST',
      body: { email: `t3_${runId}@conc.com`, password: 'MinimoOchoCaracteres', nombre: 'Tech 3 Concurrencia', rol: 'TECNICO' }
    });
    assert.equal(t3Res.status, 201);
    tech3Token = t3Res.data.data.token;
    tech3Id = t3Res.data.data.usuario.id;

    const adm = await api('/auth/login', {
      method: 'POST',
      body: { email: 'admin@mail.com', password: 'MinimoOchoCaracteres' }
    });
    assert.equal(adm.status, 200);
    adminToken = adm.data.data.token;
  });

  // -------------------------------------------------------------------------
  // Caso 1: Mismo técnico aceptar vs rechazar en competencia
  // -------------------------------------------------------------------------
  it('Caso 1: Mismo técnico aceptar vs rechazar (un 200 y un 409, sin asignación con rechazo)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 1 Mismo Tech', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 1' }
    });
    assert.equal(cRes.status, 201);
    const solId = cRes.data.data.id;

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const pAceptar = api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      const pRechazar = api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: { motivo: 'Rechazo propio en carrera' }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [resAcept, resRech] = await Promise.all([pAceptar, pRechazar]);
      const statuses = [resAcept.status, resRech.status].sort();
      assert.deepEqual(statuses, [200, 409], 'Debe haber exactamente un 200 y un 409');

      const sol = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const hist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (resAcept.status === 200) {
        // Aceptó primero: estado ACEPTADA, asignada a tech1, rechazar dio 409, y NO debe existir rechazo de tech1 en historial
        assert.equal(sol.data.data.estado, 'ACEPTADA');
        assert.equal(sol.data.data.tecnicoId, tech1Id);
        const rechazos = hist.data.data.filter(h => h.accion === 'RECHAZO' && h.cambiadoPor.id === tech1Id);
        assert.equal(rechazos.length, 0, 'No debe registrarse rechazo tras asignación');
      } else {
        // Rechazó primero: estado sigue PENDIENTE, techId es null, aceptar dio 409
        assert.equal(sol.data.data.estado, 'PENDIENTE');
        assert.equal(sol.data.data.tecnicoId, null);
      }
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 2: Otro técnico rechazar vs aceptar en competencia
  // -------------------------------------------------------------------------
  it('Caso 2: Otro técnico rechazar vs aceptar (si tomada da 409 rechazo; si rechaza antes ambos 200 serial)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 2 Otro Tech', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 2' }
    });
    assert.equal(cRes.status, 201);
    const solId = cRes.data.data.id;

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      // Tech 1 acepta, Tech 2 rechaza
      const pAceptar = api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      const pRechazar = api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech2Token}` },
        body: { motivo: 'Tech 2 fuera de radio' }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [resAcept, resRech] = await Promise.all([pAceptar, pRechazar]);

      const sol = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      // Si aceptar ganó primero, Tech 2 al intentar rechazar una solicitud ACEPTADA recibe 409
      // Si rechazar ganó primero mientras estaba PENDIENTE, ambos 200 es serialmente válido (rechazo registrado y luego asignada)
      if (resAcept.status === 200 && resRech.status === 409) {
        assert.equal(sol.data.data.estado, 'ACEPTADA');
        assert.equal(sol.data.data.tecnicoId, tech1Id);
      } else if (resAcept.status === 200 && resRech.status === 200) {
        assert.equal(sol.data.data.estado, 'ACEPTADA');
        assert.equal(sol.data.data.tecnicoId, tech1Id);
        // Historial debe reflejar RECHAZO en PENDIENTE y luego ACEPTADA
        const hist = await api(`/solicitudes/${solId}/historial`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        const actions = hist.data.data.map(h => h.accion || h.estadoNuevo);
        assert.ok(actions.includes('RECHAZO'));
        assert.ok(actions.includes('ACEPTADA'));
      } else {
        assert.fail(`Combinación de estados inesperada: aceptar=${resAcept.status}, rechazar=${resRech.status}`);
      }
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 3: Doble rechazo simultáneo del mismo técnico
  // -------------------------------------------------------------------------
  it('Caso 3: Doble rechazo simultáneo del mismo técnico (un 200, un 409, cero 500)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 3 Doble Rechazo', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 3' }
    });
    assert.equal(cRes.status, 201);
    const solId = cRes.data.data.id;

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('LOCK TABLE "RechazoSolicitud" IN SHARE MODE;');

      const p1 = api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: { motivo: 'Motivo de rechazo 1' }
      });
      const p2 = api(`/solicitudes/${solId}/rechazar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` },
        body: { motivo: 'Motivo de rechazo 2' }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409], 'Debe ser exactamente un 200 y un 409, NUNCA 500');

      const hist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const rechazos = hist.data.data.filter(h => h.accion === 'RECHAZO');
      assert.equal(rechazos.length, 1, 'Debe registrarse exactamente un evento de rechazo en historial');
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 4: Editar vs Aceptar en competencia
  // -------------------------------------------------------------------------
  it('Caso 4: Editar vs Aceptar (aceptar bloquea editar 409; datos no se mutan fuera de PENDIENTE)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Titulo Original C4', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 4' }
    });
    assert.equal(cRes.status, 201);
    const solId = cRes.data.data.id;

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const pEdit = api(`/solicitudes/${solId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { titulo: 'Titulo Editado C4' }
      });
      const pAcept = api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [rEdit, rAcept] = await Promise.all([pEdit, pAcept]);

      const sol = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (rAcept.status === 200 && rEdit.status === 409) {
        // Aceptación ganó: edición rechazada 409 y título se mantiene original
        assert.equal(sol.data.data.estado, 'ACEPTADA');
        assert.equal(sol.data.data.titulo, 'Titulo Original C4');
      } else if (rEdit.status === 200 && rAcept.status === 200) {
        // Edición ganó mientras PENDIENTE: técnico aceptó datos editados
        assert.equal(sol.data.data.estado, 'ACEPTADA');
        assert.equal(sol.data.data.titulo, 'Titulo Editado C4');
      } else {
        assert.fail(`Combinación inesperada: edit=${rEdit.status}, acept=${rAcept.status}`);
      }
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 5: Doble cancelar simultáneo
  // -------------------------------------------------------------------------
  it('Caso 5: Doble cancelar simultáneo (exactamente un 200, un 409 e historial consistente)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 5 Doble Cancelar', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 5' }
    });
    assert.equal(cRes.status, 201);
    const solId = cRes.data.data.id;

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const p1 = api(`/solicitudes/${solId}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Cancelacion 1' }
      });
      const p2 = api(`/solicitudes/${solId}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Cancelacion 2' }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);

      const hist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const cancelaciones = hist.data.data.filter(h => h.estadoNuevo === 'CANCELADA');
      assert.equal(cancelaciones.length, 1, 'Debe haber exactamente un registro de cancelación');
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 6: Cancelar vs Iniciar desde ACEPTADA
  // -------------------------------------------------------------------------
  it('Caso 6: Cancelar vs Iniciar desde ACEPTADA (solo una transición gana; perdedora 409)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 6 Cancelar vs Iniciar', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 6' }
    });
    const solId = cRes.data.data.id;

    // Tech 1 acepta primero
    const aRes = await api(`/solicitudes/${solId}/aceptar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });
    assert.equal(aRes.status, 200);

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const pCanc = api(`/solicitudes/${solId}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Cancelo trabajo aceptado' }
      });
      const pIni = api(`/solicitudes/${solId}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [rCanc, rIni] = await Promise.all([pCanc, pIni]);
      assert.deepEqual([rCanc.status, rIni.status].sort(), [200, 409], 'Exactamente una transición gana');

      const sol = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const hist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (rCanc.status === 200) {
        // Cancelar ganó: estado CANCELADA, iniciar dio 409
        assert.equal(sol.data.data.estado, 'CANCELADA');
        const transitions = hist.data.data.map(h => `${h.estadoAnterior}->${h.estadoNuevo}`);
        assert.deepEqual(transitions, ['null->PENDIENTE', 'PENDIENTE->ACEPTADA', 'ACEPTADA->CANCELADA']);
      } else {
        // Iniciar ganó: estado EN_PROCESO, cancelar dio 409
        assert.equal(sol.data.data.estado, 'EN_PROCESO');
        const transitions = hist.data.data.map(h => `${h.estadoAnterior}->${h.estadoNuevo}`);
        assert.deepEqual(transitions, ['null->PENDIENTE', 'PENDIENTE->ACEPTADA', 'ACEPTADA->EN_PROCESO']);
      }
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 7: Cancelar vs Aceptar desde PENDIENTE
  // -------------------------------------------------------------------------
  it('Caso 7: Cancelar vs Aceptar desde PENDIENTE (cancelar primero impide aceptar; nunca resucita canceladas)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 7 Cancelar vs Aceptar', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 7' }
    });
    const solId = cRes.data.data.id;

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const pCanc = api(`/solicitudes/${solId}/cancelar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${clientToken}` },
        body: { motivo: 'Cliente cancela antes de aceptar' }
      });
      const pAcept = api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [rCanc, rAcept] = await Promise.all([pCanc, pAcept]);

      const sol = await api(`/solicitudes/${solId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (rCanc.status === 200 && rAcept.status === 409) {
        // Cancelar ganó: solicitud queda CANCELADA, aceptar recibe 409
        assert.equal(sol.data.data.estado, 'CANCELADA');
      } else if (rAcept.status === 200 && rCanc.status === 200) {
        // Aceptar ganó primero (PENDIENTE -> ACEPTADA), y luego cancelar procedió (ACEPTADA -> CANCELADA)
        assert.equal(sol.data.data.estado, 'CANCELADA');
        assert.equal(sol.data.data.tecnicoId, tech1Id);
      } else {
        assert.fail(`Combinación inesperada: cancelar=${rCanc.status}, aceptar=${rAcept.status}`);
      }

      // Prohibido resucitar canceladas: intento posterior de aceptación debe fallar siempre con 409
      const reAceptar = await api(`/solicitudes/${solId}/aceptar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech2Token}` }
      });
      assert.equal(reAceptar.status, 409);
      assert.equal(reAceptar.data.error.code, 'CONFLICT');
    } finally {
      await dbClient.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 8: Iniciar / Finalizar repetidos y en competencia
  // -------------------------------------------------------------------------
  it('Caso 8: Doble iniciar simultáneo (un 200, un 409, exactamente una transición)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 8 Doble Iniciar', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 8' }
    });
    const solId = cRes.data.data.id;
    await api(`/solicitudes/${solId}/aceptar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const p1 = api(`/solicitudes/${solId}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      const p2 = api(`/solicitudes/${solId}/iniciar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);

      const hist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const inits = hist.data.data.filter(h => h.estadoNuevo === 'EN_PROCESO');
      assert.equal(inits.length, 1);
    } finally {
      await dbClient.end();
    }
  });

  it('Caso 8b: Doble finalizar simultáneo (un 200, un 409, exactamente una transición)', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 8b Doble Finalizar', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 8b' }
    });
    const solId = cRes.data.data.id;
    await api(`/solicitudes/${solId}/aceptar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });
    await api(`/solicitudes/${solId}/iniciar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });

    const dbClient = new Client({ connectionString: DATABASE_URL });
    await dbClient.connect();

    try {
      await dbClient.query('BEGIN;');
      await dbClient.query('SELECT id FROM "SolicitudServicio" WHERE id = $1 FOR UPDATE;', [solId]);

      const p1 = api(`/solicitudes/${solId}/finalizar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });
      const p2 = api(`/solicitudes/${solId}/finalizar`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tech1Token}` }
      });

      await new Promise(r => setTimeout(r, 150));
      await dbClient.query('COMMIT;');

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);

      const hist = await api(`/solicitudes/${solId}/historial`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const finishes = hist.data.data.filter(h => h.estadoNuevo === 'FINALIZADA');
      assert.equal(finishes.length, 1);
    } finally {
      await dbClient.end();
    }
  });

  it('Caso 8c: Técnico no asignado no puede iniciar/finalizar y terminal no admite transiciones', async () => {
    const cRes = await api('/solicitudes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { titulo: 'Caso 8c No Asignado', descripcion: 'D', categoria: 'PLOMERIA', direccion: 'Dir 8c' }
    });
    const solId = cRes.data.data.id;
    await api(`/solicitudes/${solId}/aceptar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });

    // Tech 2 (no asignado) intenta iniciar -> 403 FORBIDDEN
    const failStart = await api(`/solicitudes/${solId}/iniciar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech2Token}` }
    });
    assert.equal(failStart.status, 403);
    assert.equal(failStart.data.error.code, 'FORBIDDEN');

    // Tech 1 inicia
    await api(`/solicitudes/${solId}/iniciar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });

    // Tech 2 (no asignado) intenta finalizar -> 403 FORBIDDEN
    const failFin = await api(`/solicitudes/${solId}/finalizar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech2Token}` }
    });
    assert.equal(failFin.status, 403);
    assert.equal(failFin.data.error.code, 'FORBIDDEN');

    // Tech 1 finaliza -> 200
    const finOk = await api(`/solicitudes/${solId}/finalizar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });
    assert.equal(finOk.status, 200);

    // Estado terminal FINALIZADA: no admite iniciar, cancelar, aceptar ni finalizar
    const reIni = await api(`/solicitudes/${solId}/iniciar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });
    assert.equal(reIni.status, 409);

    const reCanc = await api(`/solicitudes/${solId}/cancelar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${clientToken}` },
      body: { motivo: 'Cancelar tras finalizar' }
    });
    assert.equal(reCanc.status, 409);

    const reFin = await api(`/solicitudes/${solId}/finalizar`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tech1Token}` }
    });
    assert.equal(reFin.status, 409);
  });
});
