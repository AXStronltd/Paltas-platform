/** Configuration, read once and validated at boot so a bad env fails loudly. */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: (process.env.DATABASE_URL ?? 'file:./paltas.db').replace(/^file:/, ''),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  actor: process.env.DEMO_ACTOR ?? 'Ahmed Akboole',
}
