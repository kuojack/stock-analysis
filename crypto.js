/**
 * Security Encryption Module
 * Uses native Web Crypto API (AES-GCM-256 and PBKDF2)
 * Provides client-side zero-knowledge encryption for API keys
 */

class SecureStorage {
  // Helper to convert ArrayBuffer to Base64
  static bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Helper to convert Base64 to ArrayBuffer
  static base64ToBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Helper to derive AES-GCM Key from PIN using PBKDF2
  static async deriveKey(pin, salt) {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);

    // Import the raw PIN as key material
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      pinBytes,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    // Derive the final AES-GCM 256-bit key
    return await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts FinMind and Gemini Keys using a User PIN
   * @param {string} finmindKey 
   * @param {string} geminiKey 
   * @param {string} pin 
   * @returns {Promise<string>} Base64 encoded JSON containing ciphertext, salt, and iv
   */
  static async encryptKeys(finmindKey, geminiKey, pin) {
    try {
      const encoder = new TextEncoder();
      const payload = JSON.stringify({ finmindKey, geminiKey });
      const payloadBytes = encoder.encode(payload);

      // Generate random Salt (16 bytes) and IV (12 bytes)
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      // Derive encryption key
      const key = await this.deriveKey(pin, salt);

      // Encrypt the payload
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        key,
        payloadBytes
      );

      // Package everything into a serializable object
      const securePackage = {
        ciphertext: this.bufferToBase64(ciphertext),
        salt: this.bufferToBase64(salt),
        iv: this.bufferToBase64(iv)
      };

      return JSON.stringify(securePackage);
    } catch (e) {
      console.error("Encryption failed:", e);
      throw new Error("金鑰加密失敗，請檢查系統環境！");
    }
  }

  /**
   * Decrypts keys using the User PIN
   * @param {string} securePackageJson 
   * @param {string} pin 
   * @returns {Promise<{finmindKey: string, geminiKey: string}>} Decrypted keys
   */
  static async decryptKeys(securePackageJson, pin) {
    try {
      const securePackage = JSON.parse(securePackageJson);
      
      const ciphertext = this.base64ToBuffer(securePackage.ciphertext);
      const salt = new Uint8Array(this.base64ToBuffer(securePackage.salt));
      const iv = new Uint8Array(this.base64ToBuffer(securePackage.iv));

      // Derive key with the same PIN and Salt
      const key = await this.deriveKey(pin, salt);

      // Decrypt the ciphertext
      const decryptedBytes = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv
        },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      const decryptedString = decoder.decode(decryptedBytes);
      
      return JSON.parse(decryptedString);
    } catch (e) {
      console.error("Decryption failed:", e);
      throw new Error("密碼（PIN 碼）錯誤，解密失敗！");
    }
  }
}

// Export module
window.SecureStorage = SecureStorage;
