module.exports = {
  apps: [{
    name: 'feynman-reader',
    script: 'server.js',
    cwd: process.env.FEYNMAN_READER_WEB_ROOT || '/var/www/feynman-reader',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: '8080'
    }
  }]
}
