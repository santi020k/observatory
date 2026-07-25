import type {
  Dashboard,
  SessionResponse,
} from '@santi020k/observatory-api-types'

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '')

export const getBrowserApiUrl = (): string =>
  trimTrailingSlash(import.meta.env.PUBLIC_API_URL ?? '/api')

export const getServerApiUrl = (requestUrl: URL): string => {
  const configured =
    import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL

  return configured ? trimTrailingSlash(configured) : `${requestUrl.origin}/api`
}

type ApiResponse<Result> = Response & { parsed?: Result }

const requestFromApi = async (
  path: string,
  request: Request,
  requestUrl: URL,
): Promise<ApiResponse<unknown>> => {
  const response = await fetch(`${getServerApiUrl(requestUrl)}${path}`, {
    headers: {
      cookie: request.headers.get('cookie') ?? '',
    },
  })

  if (!response.ok) return response

  const parsed: unknown = await response.json()

  return Object.assign(response, { parsed })
}

export const getSession = async (
  request: Request,
  requestUrl: URL,
): Promise<ApiResponse<SessionResponse>> =>
  (await requestFromApi(
    '/auth/session',
    request,
    requestUrl,
  )) as ApiResponse<SessionResponse>

export const getDashboard = async (
  request: Request,
  requestUrl: URL,
): Promise<ApiResponse<Dashboard>> =>
  (await requestFromApi(
    '/dashboard',
    request,
    requestUrl,
  )) as ApiResponse<Dashboard>
