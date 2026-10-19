import { config } from 'dotenv';

/**
 * Se ejecuta antes de que Jest cargue los tests. override: true para que una
 * DATABASE_URL del entorno de desarrollo no se filtre y la suite trunque la
 * base equivocada.
 */
config({ path: '.env.test', override: true });
