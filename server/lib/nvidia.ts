import OpenAI from 'openai'

async function loggingFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const clone = res.clone()
    clone.text().then(body => {
      console.error('[nvidia] HTTP', res.status, res.headers.get('content-type'), '|', body)
    }).catch(() => {})
  }
  return res
}

export function createNvidiaClient(): OpenAI {
  return new OpenAI({
    apiKey:  process.env.NVIDIA_API_KEY ?? 'nvapi-placeholder',
    baseURL: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    fetch:   loggingFetch,
  })
}

export const NVIDIA_MODEL: string =
  process.env.NVIDIA_MODEL ?? 'meta/llama-3.3-70b-instruct'
