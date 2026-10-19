/**
 * Configuracion tipada de la aplicacion, accesible via ConfigService con
 * notacion de puntos: configService.get('jwt.secret').
 */
export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'development',
    // Railway inyecta PORT; el valor por defecto es el del entorno local.
    port: parseInt(process.env.PORT ?? '3001', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    // Encendido por defecto, tambien en produccion: Swagger es parte de la entrega.
    swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  },

  database: {
    url: process.env.DATABASE_URL ?? '',
    logging: process.env.DB_LOGGING === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiration: process.env.JWT_EXPIRATION ?? '1h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
  },

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  throttle: {
    // Se apaga en los tests e2e: una suite hace muchos mas logins que el limite.
    enabled: process.env.THROTTLE_ENABLED !== 'false',
  },
});
