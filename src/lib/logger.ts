/**
 * 统一日志工具
 * 开发环境：输出到控制台
 * 生产环境：默认静默，避免在浏览器控制台暴露用户数据或内部状态
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const SHOULD_LOG = !IS_PRODUCTION

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
    if (SHOULD_LOG) {
      globalThis.console.error(this.formatMessage('error', message), ...args)
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (!IS_PRODUCTION && SHOULD_LOG) {
      globalThis.console.debug(this.formatMessage('debug', message), ...args)
    }
  }
}

export const logger = new Logger()
