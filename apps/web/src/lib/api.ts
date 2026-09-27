import type {
  AdminFeedbackItem,
  AnalyticsRange,
  Dashboard,
  ProjectDashboard,
  ProjectSettings,
  StoreAnalytics
} from '@santi020k/observatory-api-types'

export interface AdminFeedbackResponse {
  data: {
    items: AdminFeedbackItem[]
    project?: { displayName: string, slug: string }
  }
}

export interface FeedbackProjectsResponse {
  data: {
    projects: {
      displayName: string
      locales: string[]
      slug: string
      turnstileEnabled: boolean
      turnstileSiteKey: string | null
    }[]
  }
}

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '')

export const getBrowserApiUrl = (): string => '/api/backend'

export const getServerApiUrl = (requestUrl: URL): string => {
  const configured =
    import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL

  return configured ? trimTrailingSlash(configured) : `${requestUrl.origin}/api`
}

type ApiResponse<Result> = Response & { parsed?: Result }

const requestFromApi = async (
  path: string,
  request: Request,
  requestUrl: URL
): Promise<ApiResponse<unknown>> => {
  const response = await fetch(`${getServerApiUrl(requestUrl)}${path}`, {
    headers: {
      cookie: request.headers.get('cookie') ?? ''
    }
  })

  if (!response.ok) return response

  const parsed: unknown = await response.json()

  return Object.assign(response, { parsed })
}

export const getDashboard = async (
  request: Request,
  requestUrl: URL
): Promise<ApiResponse<Dashboard>> => (await requestFromApi(
  `/dashboard?range=${encodeURIComponent(requestUrl.searchParams.get('range') ?? '30d')}`, request, requestUrl
)) as ApiResponse<Dashboard>

export const getProjectDashboard = async (
  slug: string,
  range: AnalyticsRange,
  request: Request,
  requestUrl: URL
): Promise<ApiResponse<ProjectDashboard>> => (await requestFromApi(
  `/projects/${encodeURIComponent(slug)}?range=${range}`, request, requestUrl
)) as ApiResponse<ProjectDashboard>

export const getProjectSettings = async (
  request: Request,
  requestUrl: URL
): Promise<ApiResponse<ProjectSettings>> => (await requestFromApi(
  '/settings/projects', request, requestUrl
)) as ApiResponse<ProjectSettings>

export const getStoreAnalytics = async (
  range: AnalyticsRange,
  request: Request,
  requestUrl: URL
): Promise<ApiResponse<StoreAnalytics>> => (await requestFromApi(
  `/analytics/apps?range=${range}`, request, requestUrl
)) as ApiResponse<StoreAnalytics>

export const getAdminFeedback = async (
  request: Request,
  requestUrl: URL,
  projectSlug?: string
): Promise<ApiResponse<AdminFeedbackResponse>> => (await requestFromApi(
  projectSlug ?
    `/feedback/admin/projects/${encodeURIComponent(projectSlug)}/items` :
    '/feedback/admin/items', request, requestUrl
)) as ApiResponse<AdminFeedbackResponse>

export const getFeedbackProjects = async (
  request: Request,
  requestUrl: URL
): Promise<ApiResponse<FeedbackProjectsResponse>> => (await requestFromApi(
  '/feedback/projects', request, requestUrl
)) as ApiResponse<FeedbackProjectsResponse>
