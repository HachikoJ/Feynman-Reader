import '@testing-library/jest-dom'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock Web Crypto API
global.crypto = {
  getRandomValues: jest.fn().mockImplementation(arr => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }),
  subtle: {
    generateKey: jest.fn().mockResolvedValue({
      algorithm: { name: 'AES-GCM', length: 256 },
      extractable: true,
      type: 'secret',
    }),
    importKey: jest.fn(),
    exportKey: jest.fn().mockResolvedValue(new Uint8Array(32)),
    encrypt: jest.fn().mockResolvedValue(new Uint8Array(48)),
    decrypt: jest.fn().mockResolvedValue(new Uint8Array(32)),
  },
} as any
