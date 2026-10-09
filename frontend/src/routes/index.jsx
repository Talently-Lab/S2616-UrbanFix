import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import { ROLES } from '../constants/roles'
import {
  AdminConfiguracion,
  AdminDashboard,
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
      { path: '/tecnico/trabajos', element: <TecnicoTrabajos /> },
      { path: '/tecnico/trabajos/:id', element: <TecnicoDetalleTrabajo /> },
      { path: '/tecnico/perfil', element: <TecnicoPerfil /> },
    ],
  },

  {
    element: <ProtectedRoute roles={[ROLES.ADMIN]} />,
    children: [
      { path: '/admin', element: <AdminDashboard /> },
      { path: '/admin/usuarios', element: <AdminUsuarios /> },
      { path: '/admin/solicitudes', element: <AdminSolicitudes /> },
      { path: '/admin/reportes', element: <AdminReportes /> },
      { path: '/admin/configuracion', element: <AdminConfiguracion /> },
    ],
  },

  { path: '*', element: <NotFound /> },
])
