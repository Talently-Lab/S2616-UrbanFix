import { CATEGORIAS } from '../schemas/solicitud.schema.js';

export const list = (req, res) => {
  res.status(200).json({ data: CATEGORIAS });
};
