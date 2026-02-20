/**
 * Authentication Module for AI Verification Platform
 * Handles all Cognito authentication operations
 * Uses AWS SDK from CDN (loaded in HTML)
 */

// Error message mapping
const AUTH_ERROR_MESSAGES = {
  UserNotFoundException: "Correo o contraseña inválidos",
  NotAuthorizedException: "Correo o contraseña inválidos",
  UserNotConfirmedException: "Por favor verifica tu correo antes de iniciar sesión",
  CodeMismatchException: "Código de verificación inválido. Intenta de nuevo.",
  ExpiredCodeException: "El código de verificación ha expirado. Solicita uno nuevo.",
  InvalidPasswordException: "La contraseña debe tener al menos 8 caracteres con mayúsculas, minúsculas y números",
  UsernameExistsException: "Ya existe una cuenta con este correo",
  LimitExceededException: "Demasiados intentos. Intenta más tarde.",
  InvalidParameterException: "Entrada inválida. Verifica tu información.",
  NetworkError: "No se puede conectar. Verifica tu conexión a internet.",
};

class AuthModule {
  constructor(userPoolId, clientId, region) {
    this.userPoolId = userPoolId;
    this.clientId = clientId;
    this.region = region;
    this.storageKey = "ai_verification_auth";
    this.cognitoClient = null;
    this.sdkReady = false;
    this.initSDK();
  }

  async initSDK() {
    const maxAttempts = 50;
    let attempts = 0;
    while (!window.AWS && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (window.AWS && window.AWS.CognitoIdentityServiceProvider) {
      this.cognitoClient = new window.AWS.CognitoIdentityServiceProvider({ region: this.region });
      this.sdkReady = true;
      console.log("Cognito SDK initialized");
    } else {
      console.error("AWS SDK not available");
    }
  }

  async waitForSDK() {
    const maxAttempts = 50;
    let attempts = 0;
    while (!this.sdkReady && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    return this.sdkReady;
  }
  async signUp(email, password) {
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) throw new Error("SDK not ready");
      const params = {
        ClientId: this.clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }]
      };
      await this.cognitoClient.signUp(params).promise();
      return { success: true, message: "Cuenta creada exitosamente. Verifica tu correo." };
    } catch (error) {
      console.error("SignUp error:", error);
      return { success: false, message: this.translateError(error) };
    }
  }

  async confirmSignUp(email, code) {
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) throw new Error("SDK not ready");
      const params = { ClientId: this.clientId, Username: email, ConfirmationCode: code };
      await this.cognitoClient.confirmSignUp(params).promise();
      return { success: true, message: "Correo verificado exitosamente" };
    } catch (error) {
      console.error("ConfirmSignUp error:", error);
      return { success: false, message: this.translateError(error) };
    }
  }

  async resendConfirmationCode(email) {
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) throw new Error("SDK not ready");
      const params = { ClientId: this.clientId, Username: email };
      await this.cognitoClient.resendConfirmationCode(params).promise();
      return { success: true, message: "Código de verificación reenviado" };
    } catch (error) {
      console.error("ResendConfirmationCode error:", error);
      return { success: false, message: this.translateError(error) };
    }
  }

  async signIn(email, password) {
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) throw new Error("SDK not ready");
      const params = {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: this.clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password }
      };
      const response = await this.cognitoClient.initiateAuth(params).promise();
      if (response.AuthenticationResult) {
        const tokens = response.AuthenticationResult;
        this.storeAuth({
          accessToken: tokens.AccessToken,
          refreshToken: tokens.RefreshToken,
          idToken: tokens.IdToken,
          email: email,
          expiresAt: Date.now() + tokens.ExpiresIn * 1000
        });
        return { success: true, tokens: tokens, message: "Inicio de sesión exitoso" };
      }
      return { success: false, message: "Error al iniciar sesión" };
    } catch (error) {
      console.error("SignIn error:", error);
      return { success: false, message: this.translateError(error) };
    }
  }

  signOut() { localStorage.removeItem(this.storageKey); }
  async forgotPassword(email) {
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) throw new Error("SDK not ready");
      const params = { ClientId: this.clientId, Username: email };
      await this.cognitoClient.forgotPassword(params).promise();
      return { success: true, message: "Código de verificación enviado a tu correo" };
    } catch (error) {
      console.error("ForgotPassword error:", error);
      return { success: false, message: this.translateError(error) };
    }
  }

  async confirmPassword(email, code, newPassword) {
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) throw new Error("SDK not ready");
      const params = { ClientId: this.clientId, Username: email, ConfirmationCode: code, Password: newPassword };
      await this.cognitoClient.confirmForgotPassword(params).promise();
      return { success: true, message: "Contraseña restablecida exitosamente" };
    } catch (error) {
      console.error("ConfirmPassword error:", error);
      return { success: false, message: this.translateError(error) };
    }
  }

  async getAccessToken() {
    const auth = this.getStoredAuth();
    if (!auth) return null;
    const expiresIn = auth.expiresAt - Date.now();
    if (expiresIn < 5 * 60 * 1000) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) { this.signOut(); return null; }
      return this.getStoredAuth().accessToken;
    }
    return auth.accessToken;
  }

  isAuthenticated() {
    const auth = this.getStoredAuth();
    return auth !== null && auth.accessToken !== undefined;
  }

  getCurrentUserEmail() {
    const auth = this.getStoredAuth();
    return auth ? auth.email : null;
  }

  async refreshAccessToken() {
    const auth = this.getStoredAuth();
    if (!auth || !auth.refreshToken) return false;
    try {
      await this.waitForSDK();
      if (!this.cognitoClient) return false;
      const params = {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: this.clientId,
        AuthParameters: { REFRESH_TOKEN: auth.refreshToken }
      };
      const response = await this.cognitoClient.initiateAuth(params).promise();
      if (response.AuthenticationResult) {
        const tokens = response.AuthenticationResult;
        this.storeAuth({
          accessToken: tokens.AccessToken,
          refreshToken: auth.refreshToken,
          idToken: tokens.IdToken,
          email: auth.email,
          expiresAt: Date.now() + tokens.ExpiresIn * 1000
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error("RefreshToken error:", error);
      return false;
    }
  }

  storeAuth(authData) { localStorage.setItem(this.storageKey, JSON.stringify(authData)); }

  getStoredAuth() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error("Error reading stored auth:", error);
      return null;
    }
  }

  translateError(error) {
    const errorName = error.code || error.name || "UnknownError";
    if (error.message && error.message.includes("fetch")) return AUTH_ERROR_MESSAGES.NetworkError;
    return AUTH_ERROR_MESSAGES[errorName] || "Ocurrió un error. Intenta de nuevo.";
  }

  async getAuthHeader() {
    const token = await this.getAccessToken();
    if (!token) return null;
    return { Authorization: "Bearer " + token };
  }
}

window.AuthModule = AuthModule;
console.log("AuthModule loaded and available globally");