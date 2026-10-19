# syntax=docker/dockerfile:1

###########################################
# Etapa 1: dependencias + codigo (desarrollo)
###########################################
FROM node:24-alpine AS development

# Prisma necesita openssl para su query engine; node:alpine no lo trae.
RUN apk add --no-cache openssl

WORKDIR /app

# Manifiestos y schema primero para aprovechar la cache de capas: si no
# cambiaron, Docker reutiliza el npm ci anterior. El schema hace falta porque
# el postinstall corre `prisma generate`.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .

EXPOSE 3001
CMD ["npm", "run", "start:dev"]

###########################################
# Etapa 2: compilacion TypeScript -> JavaScript
###########################################
FROM node:24-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Se eliminan las devDependencies. A diferencia del backend de la aplicacion
# web, `prisma` (el CLI) esta en dependencies: la imagen final lo necesita
# para aplicar las migraciones al arrancar, porque en la nube no hay
# docker-compose que lo haga.
RUN npm prune --omit=dev --ignore-scripts

###########################################
# Etapa 3: imagen final de produccion
###########################################
# Es la ultima etapa a proposito: es la que construye Railway por defecto.
FROM node:24-alpine AS production

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

# node:alpine ya trae un usuario sin privilegios llamado "node".
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

# Railway inyecta PORT; 3001 es solo el valor por defecto local.
EXPOSE 3001

# 1. Migraciones pendientes. 2. Seed idempotente (cuentas de servicio y
# catalogo). 3. La API. Si una migracion falla, el contenedor no arranca y
# Railway mantiene la version anterior en linea.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed/seed.js && node dist/main.js"]
