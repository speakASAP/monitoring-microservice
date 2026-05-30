/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    MONITORING_API_URL: process.env.MONITORING_API_URL || 'http://monitoring-microservice:3395',
  },
};
module.exports = nextConfig;
