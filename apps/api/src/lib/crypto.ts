const encoder = new TextEncoder()

const toHex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)]
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('')

export const hashValue = async (
  secret: string,
  value: string
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']
  )

  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value))

  return toHex(digest)
}

export const generateToken = (): string => {
  const bytes = new Uint8Array(32)

  crypto.getRandomValues(bytes)

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export const safeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false

  let difference = 0

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return difference === 0
}
