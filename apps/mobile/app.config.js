// EAS file-type environment variable: a Firebase Android client configuration.
// Keep the actual JSON outside Git and provide it only in the matching EAS environment.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
  },
});
