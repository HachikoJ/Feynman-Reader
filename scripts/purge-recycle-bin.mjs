/* eslint-disable no-console */
import { readFileSync } from 'node:fs'

const envFile = process.env.FEYNMAN_READER_ENV_FILE || '/etc/feynman-reader.env'
try {
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    if (!process.env[key]) process.env[key] = value
  }
} catch (error) {
  console.error(`无法读取环境文件 ${envFile}:`, error instanceof Error ? error.message : error)
  process.exitCode = 1
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 未配置。')
  process.exitCode = 1
} else {
  const { Pool } = await import('pg')
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim()
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  })
  try {
    const result = await pool.query(`delete from public.user_books
      where deleted_at is not null
        and coalesce(purge_at, deleted_at + interval '30 days') <= now()`)
    console.log(`回收站清理完成：删除 ${result.rowCount || 0} 条过期记录。`)
  } finally {
    await pool.end()
  }
}
