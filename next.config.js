import localEnv from './lib/load-local-env.cjs';

localEnv.loadLocalEnvFromPath();

const nextConfig = {
  poweredByHeader: false
};

export default nextConfig;
