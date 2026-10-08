export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
  }

  // req.query es un getter en Express 5: hay que definir la propiedad propia
  Object.defineProperty(req, source, {
    value: result.data,
    writable: true,
    configurable: true,
    enumerable: true
  });

  next();
};
