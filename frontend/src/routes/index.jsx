import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import AdminShell from '../components/layout/AdminShell'
import { ROLES } from '../constants/roles'
import {
  AdminConfiguracion,
  AdminDashboard,
  AdminDetalleSolicitud,
  AdminReportes,
  AdminSolicitudes,
  AdminUsuarios,
} from '../pages/admin'
import {
  ClienteDashboard,
  ClienteDetalleSolicitud,
  ClienteNuevaSolicitud,
  ClientePerfil,
  ClienteSolicitudes,
} from '../pages/cliente'
import Forbidden from '../pages/public/Forbidden'
import Home from '../pages/public/Home'
import Login from '../pages/public/Login'
import NotFound from '../pages/public/NotFound'
import Register from '../pages/public/Register'
import {
  TecnicoDashboard,
  TecnicoDetalleDisponible,
  TecnicoDetalleTrabajo,
  TecnicoDisponibles,
  TecnicoPerfil,
  TecnicoTrabajos,
} from '../pages/tecnico'

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
  { path: '/registro', element: <Register /> },
  { path: '/acceso-denegado', element: <Forbidden /> },

  {
    element: <ProtectedRoute roles={[ROLES.CLIENTE]} />,
    children: [
      { path: '/cliente', element: <ClienteDashboard /> },
      { path: '/cliente/solicitudes', element: <ClienteSolicitudes /> },
      { path: '/cliente/solicitudes/nueva', element: <ClienteNuevaSolicitud /> },
      { path: '/cliente/solicitudes/:id', element: <ClienteDetalleSolicitud /> },
      { path: '/cliente/perfil', element: <ClientePerfil /> },
    ],
  },

  {
    element: <ProtectedRoute roles={[ROLES.TECNICO]} />,
    children: [
      { path: '/tecnico', element: <TecnicoDashboard /> },
      { path: '/tecnico/disponibles', element: <TecnicoDisponibles /> },
      { path: '/tecnico/disponibles/:id', element: <TecnicoDetalleDisponible /> },
      { path: '/tecnico/trabajos', element: <TecnicoTrabajos /> },
      { path: '/tecnico/trabajos/:id', element: <TecnicoDetalleTrabajo /> },
      { path: '/tecnico/perfil', element: <TecnicoPerfil /> },
    ],
  },

  {
    element: <ProtectedRoute roles={[ROLES.ADMIN]} shell={false} />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { path: '/admin', element: <AdminDashboard /> },
          { path: '/admin/usuarios', element: <AdminUsuarios /> },
          { path: '/admin/solicitudes', element: <AdminSolicitudes /> },
          { path: '/admin/solicitudes/:id', element: <AdminDetalleSolicitud /> },
          { path: '/admin/reportes', element: <AdminReportes /> },
          { path: '/admin/configuracion', element: <AdminConfiguracion /> },
        ],
      },
    ],
  },

  { path: '*', element: <NotFound /> },
])
