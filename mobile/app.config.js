module.exports = ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || '';
  return {
    ...config,
    android: {
      ...config.android,
      usesCleartextTraffic: apiBaseUrl.startsWith('http://'),
    },
  };
};
