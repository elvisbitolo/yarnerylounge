const OAUTH_AUTHORIZE = {
  google: { scopes: "profile email openid", prompt: "select_account" },
  facebook: {},
};

const OAUTH_FAILED_KEYS = {
  google: "googleFailed",
  facebook: "facebookFailed",
};

export function oauthAuthorizeOptions({ provider, mode, appUrl }) {
  const config = OAUTH_AUTHORIZE[provider];
  if (!config) throw new Error(`Unsupported sign-in provider: ${provider}`);
  return {
    ...config,
    redirectTo: `${appUrl}/${mode}?provider=${provider}`,
  };
}

export function oauthFailedKey(provider) {
  return OAUTH_FAILED_KEYS[provider] || OAUTH_FAILED_KEYS.google;
}
