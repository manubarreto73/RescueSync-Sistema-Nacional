-- CreateEnum
CREATE TYPE "RolCuenta" AS ENUM ('ADMIN', 'SERVICIO', 'ONG');

-- CreateEnum
CREATE TYPE "CategoriaRecurso" AS ENUM ('PERSONAL', 'ALIMENTOS', 'AGUA_POTABLE', 'MEDICAMENTOS', 'ABRIGO_Y_REFUGIO', 'EQUIPAMIENTO', 'TRANSPORTE_Y_LOGISTICA', 'OTRO');

-- CreateEnum
CREATE TYPE "NivelGravedad" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "TipoOrganizacion" AS ENUM ('ONG', 'ORGANISMO_RESCATE');

-- CreateEnum
CREATE TYPE "EstadoOrganizacion" AS ENUM ('PENDIENTE', 'HABILITADA', 'SUSPENDIDA');

-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('EN_EJECUCION', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "EstadoCompromiso" AS ENUM ('ACTIVO', 'LIBERADO');

-- CreateTable
CREATE TABLE "certificaciones" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "categoria" "CategoriaRecurso" NOT NULL,

    CONSTRAINT "certificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizacion_certificaciones" (
    "id" SERIAL NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "certificacion_id" INTEGER NOT NULL,
    "nivel" INTEGER NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,

    CONSTRAINT "organizacion_certificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(100) NOT NULL,
    "rol" "RolCuenta" NOT NULL,
    "organizacion_id" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizaciones" (
    "id" SERIAL NOT NULL,
    "codigo_nacional" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "tipo" "TipoOrganizacion" NOT NULL,
    "cuit" VARCHAR(11) NOT NULL,
    "estado" "EstadoOrganizacion" NOT NULL DEFAULT 'HABILITADA',
    "fecha_alta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" SERIAL NOT NULL,
    "referencia_externa" VARCHAR(50) NOT NULL,
    "gravedad" "NivelGravedad" NOT NULL,
    "estado" "EstadoProyecto" NOT NULL DEFAULT 'EN_EJECUCION',
    "fecha_inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compromisos" (
    "id" SERIAL NOT NULL,
    "proyecto_id" INTEGER NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "estado" "EstadoCompromiso" NOT NULL DEFAULT 'ACTIVO',
    "fecha_compromiso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_liberacion" TIMESTAMP(3),

    CONSTRAINT "compromisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compromiso_items" (
    "id" SERIAL NOT NULL,
    "compromiso_id" INTEGER NOT NULL,
    "recurso_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "compromiso_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recursos" (
    "id" SERIAL NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "categoria" "CategoriaRecurso" NOT NULL,
    "unidad" VARCHAR(30) NOT NULL,
    "cantidad_total" INTEGER NOT NULL,
    "cantidad_comprometida" INTEGER NOT NULL DEFAULT 0,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recursos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificaciones_codigo_key" ON "certificaciones"("codigo");

-- CreateIndex
CREATE INDEX "certificaciones_categoria_idx" ON "certificaciones"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "organizacion_certificaciones_organizacion_id_certificacion__key" ON "organizacion_certificaciones"("organizacion_id", "certificacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_email_key" ON "cuentas"("email");

-- CreateIndex
CREATE INDEX "cuentas_organizacion_id_idx" ON "cuentas"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_codigo_nacional_key" ON "organizaciones"("codigo_nacional");

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_nombre_key" ON "organizaciones"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_cuit_key" ON "organizaciones"("cuit");

-- CreateIndex
CREATE INDEX "organizaciones_estado_idx" ON "organizaciones"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_referencia_externa_key" ON "proyectos"("referencia_externa");

-- CreateIndex
CREATE INDEX "compromisos_organizacion_id_idx" ON "compromisos"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "compromisos_proyecto_id_organizacion_id_key" ON "compromisos"("proyecto_id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "compromiso_items_compromiso_id_recurso_id_key" ON "compromiso_items"("compromiso_id", "recurso_id");

-- CreateIndex
CREATE INDEX "recursos_categoria_idx" ON "recursos"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "recursos_organizacion_id_categoria_key" ON "recursos"("organizacion_id", "categoria");

-- AddForeignKey
ALTER TABLE "organizacion_certificaciones" ADD CONSTRAINT "organizacion_certificaciones_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizacion_certificaciones" ADD CONSTRAINT "organizacion_certificaciones_certificacion_id_fkey" FOREIGN KEY ("certificacion_id") REFERENCES "certificaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisos" ADD CONSTRAINT "compromisos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisos" ADD CONSTRAINT "compromisos_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromiso_items" ADD CONSTRAINT "compromiso_items_compromiso_id_fkey" FOREIGN KEY ("compromiso_id") REFERENCES "compromisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromiso_items" ADD CONSTRAINT "compromiso_items_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restricciones CHECK (escritas a mano: Prisma no las genera).
-- ---------------------------------------------------------------------------

-- Red de seguridad contra la sobre-asignacion: aunque algun camino del
-- codigo se salteara el SELECT ... FOR UPDATE, PostgreSQL rechaza dejar un
-- recurso con mas comprometido que total.
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_cantidad_comprometida_check"
    CHECK ("cantidad_comprometida" >= 0 AND "cantidad_comprometida" <= "cantidad_total");

ALTER TABLE "organizacion_certificaciones" ADD CONSTRAINT "organizacion_certificaciones_nivel_check"
    CHECK ("nivel" BETWEEN 1 AND 4);

ALTER TABLE "compromiso_items" ADD CONSTRAINT "compromiso_items_cantidad_check"
    CHECK ("cantidad" > 0);
