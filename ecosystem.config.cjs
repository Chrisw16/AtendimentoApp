module.exports = {
  apps: [
    {
      name: "maxxi",
      script: "server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "DD/MM/YYYY HH:mm:ss",
      error_file: "./logs/pm2-error.log",
      out_file:   "./logs/pm2-out.log",
    },
  ],
};
