// PM2 конфигурация автозапуска
module.exports = {
  apps: [
    {
      name: "gnb-bot",
      script: "dist/index.js",
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
      },
      log_file: "bot-pm2.log",
      error_file: "bot-pm2-error.log",
      out_file: "bot-pm2-out.log",
      time: true,
    },
  ],
};
