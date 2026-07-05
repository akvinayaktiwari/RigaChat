import type { ApiResponse } from '../types/index'

const BASE_URL = import.meta.env.VITE_API_URL

export async function apiClient<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw new Error(`API request to ${path} failed with status ${response.status}`)
  }

  return (await response.json()) as ApiResponse<T>
}
