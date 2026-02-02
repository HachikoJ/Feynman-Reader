/**
 * 统一日志工具
 * 开发环境：输出到控制台
 * 生产环境：可通过 IS_PRODUCTION 环境变量控制是否输出
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// 允许在生产环境输出错误日志
const SHOULD_LOG = !IS_PRODUCTION || typeof window !== 'undefined'

class Logger {
  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`
    return `${prefix} ${message}`
  }

  log(message: string, ...args: unknown[]): void {
    if (SHOULD_LOG) {
      globalThis.console.log(this.formatMessage('log', message), ...args)
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (SHOULD_LOG) {
      globalThis.console.info(this.formatMessage('info', message), ...args)
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (SHOULD_LOG) {
      globalThis.console.warn(this.formatMessage('warn', message), ...args)
    }
  }

  error(message: string, ...args: unknown[]): void {
    // 错误日志始终输出
    globalThis.console.error(this.formatMessage('error', message), ...args)
  }

  debug(message: string, ...args: unknown[]): void {
    if (!IS_PRODUCTION && SHOULD_LOG) {
      globalThis.console.debug(this.formatMessage('debug', message), ...args)
    }
  }
}

export const logger = new Logger()
